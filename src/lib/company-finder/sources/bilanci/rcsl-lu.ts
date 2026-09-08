// ---------- LBR / RCSL — Lussemburgo (comptes annuels gratuiti) ----------
// Fatti verificati il 08/09/2026 (fonti: lbr.lu, guichet.lu, FAQ ufficiale del
// Governo lussemburghese del 09/02/2021, data.public.lu):
//
//  - la consultazione dei conti annuali depositati al RCS è GRATUITA dal
//    01/06/2016 e non richiede identificazione (prima costava 2,50 € a deposito);
//  - i documenti del fascicolo (statuts coordonnés, atti) sono PDF gratuiti con
//    account gratuito; restano a pagamento solo estratti certificati e certificati;
//  - il nuovo portale SPA (lbr.lu/mjrcs-web-front) è protetto da Friendly Captcha:
//    la ricerca lato server DEGRADA a REGISTRY_ONLY (stesso caso dell'e-Beszámoló
//    ungherese): il browser dell'utente completa la verifica, poi scarica gratis;
//  - i permalink ufficiali gd.lu (gd.lu/rcsl/… e gd.lu/resa/…) risolvono alle
//    rendition ufficiali dei depositi in HTML eCDF SENZA autenticazione —
//    verificato in diretta con Ferrero International S.A. (B60814), dépôt
//    26/15426: bilancio integrale FY 2024/2025 (attivo 11,3 mld €) a costo zero;
//  - la Centrale des Bilans (STATEC) pubblica su data.public.lu il dataset
//    “Données comptes annuels” (XML strutturato, licenza CC-BY-SA) per l'uso bulk.
//
// Strategia del provider (catena di fallback, identica filosofia di cbso-be):
//   1. link gd.lu incollato dall'utente           → documento ufficiale in pagina
//   2. numero RCS (B…) nel campo IVA              → pagina depositi LBR; se la fonte
//      risponde con link documentali li serve via proxy, se risponde con CAPTCHA
//      degrada a REGISTRY_ONLY dichiarando il motivo
//   3. niente RCS                                 → istruzioni per recuperarlo
//      (risoluzione per nome fatta dall'orchestratore via GLEIF / OpenCorporates)
//
// Le IVA lussemburghesi (LU + 8 cifre) NON coincidono con il numero RCS
// (Ferrero: IVA LU17217953, RCS B60814): un input di sole cifre non è accettato
// come RCS per evitare falsi positivi.

import type { FinancialDocumentSummary, Financials } from "../../types";

export interface LuxFiling {
  url: string;
  title: string;
  year?: number | undefined;
  kind: FinancialDocumentSummary["kind"];
  format: FinancialDocumentSummary["format"];
}

export interface LuxAccountsResult {
  ok: boolean;
  data?: Financials | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

const LBR_COMPANY_PAGE = "https://www.lbr.lu/mjrcs-web-front/consult-company";
const LU_ACCOUNT_PAGE =
  "https://www.lbr.lu/mjrcs-web-front/consult-company/{rcs}?tab=deposit";

const ENV: Record<string, string | undefined> =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

/** Template opzionale per un endpoint di ricerca RCS alternativo: `{rcs}` nel URL. */
const LBR_SEARCH_URL_TEMPLATE = ENV["LBR_RCS_SEARCH_URL"];

const CAPTCHA_MARKERS = /friendly\s*captcha|captcha widget|captcha resolution/i;

/** RCS lussemburghese: una lettera + 1–7 cifre (es. B60814, F01234). */
const RCS_PATTERN = /^[A-Z]\d{1,7}$/;

/**
 * Normalizza il numero RCS dal campo partita IVA.
 * Accetta "B60814", "B 60.814", "b-60814". Rifiuta IVA lussemburghesi pure
 * ("LU17217953" o "17217953"): IVA e RCS non coincidono.
 */
export function luxRcsFromInput(raw: string): string | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  if (/^LU/i.test(v) || /^\d{6,10}$/.test(v)) return undefined;
  const compact = v.replace(/[\s.\-_/]/g, "").toUpperCase();
  return RCS_PATTERN.test(compact) ? compact : undefined;
}

/** Primo numero RCS trovato in un testo qualsiasi (es. EUID "LURCSL.B60814", GLEIF "reg. B60814"). */
export function luxRcsFromAnyText(text: string): string | undefined {
  const compact = (text ?? "").replace(/[\s.\-_/]/g, "").toUpperCase();
  const match = compact.match(/[A-Z]\d{4,7}/);
  if (!match || !RCS_PATTERN.test(match[0])) return undefined;
  // escludi falsi positivi tipici: prefissi alfanumerici di partita IVA
  if (/^LU\d/.test(match[0])) return undefined;
  return match[0];
}

/** Link gd.lu incollato dall'utente (rcsl = deposito, resa = pubblicazione). */
export function gdLuLinkFromInput(raw: string): string | undefined {
  const v = (raw ?? "").trim();
  const match = v.match(/(?:https?:\/\/)?(?:www\.)?gd\.lu\/(rcsl|resa)\/([A-Za-z0-9_-]+)/i);
  if (!match) return undefined;
  return `https://gd.lu/${match[1]!.toLowerCase()}/${match[2]}`;
}

function kindFromTitle(title: string): LuxFiling["kind"] {
  const t = title.toLowerCase();
  if (/consolid/.test(t)) return "ANNUAL_REPORT";
  if (/audit|contr[oô]le|revis/.test(t)) return "AUDIT_REPORT";
  if (/compte|bilan|ecdf|balance|jahresabschluss/.test(t)) return "BALANCE_SHEET";
  return "OTHER";
}

function formatFromUrl(url: string): LuxFiling["format"] {
  if (/\.pdf([?#]|$)/i.test(url)) return "pdf";
  if (/gd\.lu\/rcsl\//i.test(url)) return "html"; // rendition eCDF ufficiale
  return "unknown";
}

function yearFromText(text: string): number | undefined {
  const years = [...text.matchAll(/\b(19|20)(\d{2})\b/g)].map((m) => Number(`20${m[2]}`));
  const plausible = years.filter((y) => y >= 1990 && y <= 2100);
  return plausible.length > 0 ? Math.max(...plausible) : undefined;
}

function proxied(url: string, accept: string): string {
  return `/api/company-finder/document?url=${encodeURIComponent(url)}&accept=${encodeURIComponent(accept)}`;
}

/**
 * Estrae i link documentali da una pagina LBR (fascicolo società / depositi).
 * Cattura: link gd.lu ufficiali, link a document/PDF/depot del portale.
 */
export function parseLuxFilingLinks(html: string, base: string): LuxFiling[] {
  const out: LuxFiling[] = [];
  const seen = new Set<string>();
  const anchor = /<a\b[^>]*?href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchor)) {
    const href = (match[1] ?? "").trim();
    const inner = (match[2] ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!href || href.startsWith("#") || /^javascript:/i.test(href)) continue;
    const isGdLu = /gd\.lu\/(rcsl|resa)\//i.test(href);
    const isDoc =
      /\.pdf([?#]|$)/i.test(href) ||
      /(display.*document|documentaction|depot|dossier|download|file)/i.test(href);
    const isAccounts = /compte|ecdf|bilan|consolid/i.test(inner);
    if (!isGdLu && !(isDoc && (isAccounts || /\.pdf/i.test(href)))) continue;
    let absolute: string;
    try {
      absolute = new URL(href, base).toString();
    } catch {
      continue;
    }
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    out.push({
      url: absolute,
      title: inner || (isGdLu ? "Depósito ufficiale (gd.lu)" : "Documento depositato"),
      year: yearFromText(`${inner} ${href}`),
      kind: kindFromTitle(inner),
      format: formatFromUrl(absolute),
    });
  }
  out.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  return out;
}

function toSummaries(filings: LuxFiling[]): FinancialDocumentSummary[] {
  return filings.slice(0, 20).map((f, i) => ({
    id: `${f.year ?? "nd"}-${i}`,
    year: f.year,
    kind: f.kind,
    format: f.format,
    availability: "DOCUMENT_DOWNLOADABLE" as const,
    title: f.title,
    downloadUrl: proxied(f.url, f.format === "pdf" ? "application/pdf" : "text/html"),
  }));
}

async function tryFetch(
  url: string,
  signal: AbortSignal,
): Promise<{ ok: boolean; status: number; html: string; finalUrl: string }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "TPbox-CompanyFinder/1.0",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "fr;q=0.9,en;q=0.8",
    },
    signal,
    cache: "no-store",
    redirect: "follow",
  });
  const html = res.ok ? await res.text() : "";
  return { ok: res.ok, status: res.status, html, finalUrl: url };
}

export interface LuxAccountsInput {
  rcs?: string | undefined;
  query?: string | undefined;
  gdLuUrl?: string | undefined;
}

export async function fetchLuxAccounts(
  input: LuxAccountsInput,
  timeoutMs = 20000,
): Promise<LuxAccountsResult> {
  const SOURCE = "LBR — Registre de commerce et des sociétés (Lussemburgo)";

  // ---- 1. Permalink ufficiale gd.lu: documento servito subito in pagina ----
  if (input.gdLuUrl) {
    return {
      ok: true,
      data: {
        available: true,
        years: [],
        availability: "DOCUMENT_DOWNLOADABLE",
        documentUrl: proxied(input.gdLuUrl, "text/html"),
        documentTitle: "Deposito ufficiale RCSL — rendizione eCDF (gd.lu)",
        source: SOURCE,
        note: "Rendizione ufficiale eCDF del deposito, pubblica e gratuita (permalink gd.lu del Registre de commerce et des sociétés). Il proxy del tool la serve in pagina: nessun reindirizzamento.",
      },
    };
  }

  const rcs = input.rcs && RCS_PATTERN.test(input.rcs) ? input.rcs : undefined;
  if (!rcs) {
    return {
      ok: false,
      skipped:
        "servi il numero RCS (es. B60814) nel campo partita IVA, oppure un link gd.lu del deposito; in alternativa inserisci la ragione sociale esatta: il tool risolve il RCS via GLEIF/OpenCorporates",
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const candidates: string[] = [
    LU_ACCOUNT_PAGE.replace("{rcs}", rcs),
    `${LBR_COMPANY_PAGE}/${rcs}?tab=deposit`,
    ...(LBR_SEARCH_URL_TEMPLATE
      ? [LBR_SEARCH_URL_TEMPLATE.replace("{rcs}", encodeURIComponent(rcs))]
      : []),
  ];
  // dedup + visita in ordine: la prima pagina raggiungibile con contenuti vince
  const tried = new Set<string>();
  try {
    let sawCaptcha = false;
    let lastStatus = 0;
    for (const url of candidates) {
      if (tried.has(url)) continue;
      tried.add(url);
      let page: Awaited<ReturnType<typeof tryFetch>>;
      try {
        page = await tryFetch(url, ctrl.signal);
      } catch (e) {
        const err = e as { name?: string } | undefined;
        return {
          ok: false,
          error: err?.name === "AbortError" ? "LBR/RCSL: timeout" : "LBR/RCSL: errore di rete",
        };
      }
      lastStatus = page.status;
      if (CAPTCHA_MARKERS.test(page.html)) {
        sawCaptcha = true;
        continue; // prova il candidato successivo prima di arrendersi
      }
      if (!page.ok) continue;

      const filings = parseLuxFilingLinks(page.html, page.finalUrl);
      if (filings.length === 0) continue;
      const accounts = filings.filter((f) => f.kind !== "OTHER");
      const list = accounts.length > 0 ? accounts : filings;
      const latest = list[0]!;
      return {
        ok: true,
        data: {
          available: true,
          years: [],
          availability: "DOCUMENT_DOWNLOADABLE",
          documentUrl: proxied(
            latest.url,
            latest.format === "pdf" ? "application/pdf" : "text/html",
          ),
          documentTitle: `${latest.title} — RCS ${rcs}`,
          documents: toSummaries(list),
          source: SOURCE,
          note: "Comptes annuels pubblicati gratuitamente dal RCS lussemburghese (gratuiti dal 01/06/2016). Il documento è servito in pagina dal proxy del tool.",
        },
      };
    }

    // ---- degradazione dichiarata: nessun link estraibile automaticamente ----
    if (sawCaptcha) {
      return {
        ok: true,
        data: {
          available: false,
          years: [],
          availability: "REGISTRY_ONLY",
          restriction: "CAPTCHA_REQUIRED",
          documents: [],
          source: SOURCE,
          note: `Il fascicolo della società (RCS ${rcs}) è pubblico e i comptes annuels sono gratuiti dal 2016, ma il portale LBR protegge la ricerca con un CAPTCHA: la verifica si completa nel browser dalla scheda del registro ufficiale, poi il PDF si scarica senza costi né abbonamenti.`,
        },
      };
    }
    return {
      ok: true,
      data: {
        available: false,
        years: [],
        availability: "REGISTRY_ONLY",
        restriction: lastStatus && lastStatus >= 500 ? "SOURCE_UNAVAILABLE" : "SOURCE_RESTRICTION",
        documents: [],
        source: SOURCE,
        note: `Nessun link documentale estraibile automaticamente per RCS ${rcs}: i comptes annuels restano consultabili e scaricabili gratuitamente dal fascicolo della società sul portale LBR.`,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
