// ---------- Unternehmensregister — Germania: documenti di bilancio ufficiali ----------
// Portale UFFICIALE e GRATUITO (Unternehmensregister, dal 2022 aggrega anche
// Bundesanzeiger): i Jahresabschlüsse (bilanci d'esercizio) delle società di
// capitali sono pubblici, senza account né pagamento.
//
// Flusso (verificato live 2026-08):
//   1. GET https://www.unternehmensregister.de/api/search-token  → { token }
//   2. GET /de/suche?area=ACCOUNTING&companyName={q}&searchToken={t}
//      → pagina server-rendered; i risultati (companyDto + publicationDto)
//        sono nel payload RSC (self.__next_f.push).
//   3. Ogni pubblicazione ha un encryptedPayload → pagina ufficiale
//      /de/veroeffentlichung?encryptedPayload=... con il documento (PDF/XBRL).
//
// Il tool NON reindirizza l'utente: il documento viene servito dal proxy
// in-page /api/company-finder/document (whitelist dei domini ufficiali).

import type { Financials } from "../../types";

const UR_BASE = "https://www.unternehmensregister.de";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface UrResult {
  ok: boolean;
  data?: Financials | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

interface UrCompany {
  name?: string | undefined;
  location?: string | undefined;
  euid?: string | undefined;
  registerNumber?: string | undefined;
}

interface UrPublication {
  publicationType?: { id?: number | undefined; i18n_key?: string } | undefined;
  companyNameAtTimeOfPublication?: string | undefined;
  companyLocation?: string | undefined;
  sourceDate?: string | undefined;
  title?: string | undefined;
  language?: string | undefined;
  hasPdf?: boolean | undefined;
  esefPub?: boolean | undefined;
  xmlPub?: boolean | undefined;
  deposit?: boolean | undefined;
  encryptedPayload?: string | undefined;
}

/** De-escape i chunk RSC (self.__next_f.push([1,"..."])). */
function rscBlob(html: string): string {
  const chunks = html.match(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g) ?? [];
  const out: string[] = [];
  for (const c of chunks) {
    const m = c.match(/^self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)$/);
    if (!m) continue;
    try {
      out.push(JSON.parse(`"${m[1]}"`));
    } catch {
      /* ignore */
    }
  }
  return out.join("\n");
}

/** Estrae tutti gli oggetti JSON con balanced-brace dal punto di partenza '{'. */
function extractObjects(blob: string, marker: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let i = 0;
  while (true) {
    const at = blob.indexOf(marker, i);
    if (at < 0) break;
    const start = at + marker.length;
    if (blob[start] !== "{") {
      i = at + marker.length;
      continue;
    }
    let depth = 0;
    let end = -1;
    for (let j = start; j < blob.length && j < start + 20000; j++) {
      const ch = blob[j];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) break;
    try {
      out.push(JSON.parse(blob.slice(start, end + 1)));
    } catch {
      /* ignore */
    }
    i = end + 1;
  }
  return out;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .toLowerCase();
}

function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.startsWith(y) || y.startsWith(x)) return 0.9;
  if (x.includes(y) || y.includes(x)) return 0.75;
  return 0;
}

async function getToken(signal: AbortSignal): Promise<string> {
  const res = await fetch(`${UR_BASE}/api/search-token`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`UR search-token HTTP ${res.status}`);
  const j = (await res.json()) as { token?: string } | undefined;
  const token = j?.token;
  if (!token) throw new Error("UR: token assente nella risposta");
  return token;
}

// 2) pubblicazioni contabili: filtro per tipo di pubblicazione.
//    id tipo (dall'elenco ufficiale accountingPublicationTypes del portale):
//      135 = Jahres- und Konzernabschluss (bilancio + consolidato)
//      86  = §§ 264 Abs. 3, 264b HGB (rendiconto depositato)
//    si prova 135, poi 86, poi area intera.
async function fetchSearch(
  token: string,
  companyName: string,
  publicationType?: number,
  signal?: AbortSignal,
): Promise<string> {
  let url = `${UR_BASE}/de/suche?area=ACCOUNTING&companyName=${encodeURIComponent(companyName)}&searchToken=${encodeURIComponent(token)}`;
  if (publicationType) url += `&publicationType=${publicationType}`;
  // exactOptionalPropertyTypes: RequestInit.signal ammette null ma non undefined
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: signal ?? null,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`UR HTTP ${res.status}`);
  return res.text();
}

export async function searchUrAccounting(
  companyName: string,
  timeoutMs = 30000,
): Promise<UrResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const token = await getToken(ctrl.signal);
    const variants: Array<{ publicationType?: number | undefined; label: string }> = [
      { publicationType: 135, label: "Jahres- und Konzernabschluss" },
      { publicationType: 86, label: "Rendiconto depositato (HGB)" },
      { publicationType: undefined, label: "tutte le pubblicazioni" },
    ];
    let blob = "";
    let lastNote = "";
    for (const v of variants) {
      const html = await fetchSearch(token, companyName, v.publicationType, ctrl.signal);
      const b = rscBlob(html);
      if (!b) continue;
      const pubs = extractObjects(b, '"publicationDto":');
      if (pubs.length > 0) {
        blob = b;
        lastNote = v.label;
        break;
      }
      lastNote = `nessun documento nell'area "${v.label}"`;
    }
    if (!blob) {
      return {
        ok: true,
        data: {
          available: false,
          years: [],
          note: `Impresa cercata sul Unternehmensregister: ${lastNote}.`,
        },
      };
    }

    // 1) imprese
    const companies = extractObjects(blob, '"companyDto":').map((c) => c as unknown as UrCompany);
    const firstCompany = companies[0];
    // stessa condizione di prima: elenco vuoto → nessuna impresa trovata
    if (companies.length === 0 || !firstCompany)
      return { ok: false, error: "UR: nessuna impresa trovata per la ricerca" };
    // migliore per similarità al nome
    let best = firstCompany;
    let bestScore = 0;
    for (const c of companies) {
      const s = similarity(c.name ?? "", companyName);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }

    // 2) pubblicazioni (contabilità/bilanci)
    const pubs = extractObjects(blob, '"publicationDto":').map(
      (p) => p as unknown as UrPublication,
    );
    const companyKey = norm(best.name ?? "");
    const isSameCompany = (p: UrPublication) => {
      const k = norm(p.companyNameAtTimeOfPublication ?? "");
      return !!k && (k === companyKey || k.startsWith(companyKey) || companyKey.startsWith(k));
    };
    if (pubs.length === 0) {
      return {
        ok: true,
        data: {
          available: false,
          years: [],
          note: `Impresa trovata al Unternehmensregister (${best.name}), ma nessuna pubblicazione contabile indicizzata per l'area "Rendiconti/Financial disclosures".`,
        },
      };
    }
    // priorità: (1) bilancio vero (titolo) dell'impresa scelta, (2) PDF/XBRL
    // dell'impresa scelta, (3) altra pubblicazione dell'impresa scelta,
    // (4) qualunque pubblicazione con documento.
    const byDate = (a: UrPublication, b: UrPublication) =>
      (b.sourceDate ?? "").localeCompare(a.sourceDate ?? "");
    const isBilancioTitle = (p: UrPublication) =>
      /abschl|bilanz|finanzbericht|annual|consolidat/i.test(p.title ?? "");
    const hasDoc = (p: UrPublication) => !!p.hasPdf || !!p.esefPub || !!p.xmlPub;

    const own = pubs.filter(isSameCompany).sort(byDate);
    const others = pubs.filter((p) => !isSameCompany(p)).sort(byDate);
    const chosen =
      own.find((p) => isBilancioTitle(p) && hasDoc(p)) ??
      own.find((p) => isBilancioTitle(p)) ??
      own.find(hasDoc) ??
      own[0] ??
      others.find((p) => isBilancioTitle(p) && hasDoc(p)) ??
      others.find(hasDoc) ??
      others[0];
    if (!chosen?.encryptedPayload) {
      return {
        ok: true,
        data: {
          available: false,
          years: [],
          note: "Pubblicazioni contabili trovate ma prive di documento accessibile (nessun PDF/XBRL indicizzato).",
        },
      };
    }

    const title =
      [chosen.title, chosen.companyNameAtTimeOfPublication, chosen.sourceDate]
        .filter(Boolean)
        .join(" · ") || "Documento contabile";
    const docUrl = `/api/company-finder/document?url=${encodeURIComponent(
      `${UR_BASE}/de/veroeffentlichung?encryptedPayload=${encodeURIComponent(chosen.encryptedPayload)}`,
    )}`;

    return {
      ok: true,
      data: {
        available: true,
        years: [],
        source: `Unternehmensregister (DE) — ${chosen.title ?? "Rendiconto"}`,
        documentUrl: docUrl,
        documentTitle: title,
        note:
          chosen.hasPdf || chosen.esefPub || chosen.xmlPub
            ? "Documento ufficiale gratuito (Jahresabschluss / bilancio d'esercizio) servito in pagina dal proxy del tool."
            : "Pubblicazione ufficiale gratuita servita in pagina dal proxy del tool.",
      },
    };
  } catch (e) {
    const err = e as
      | { name?: string | undefined; message?: string | undefined; cause?: { code?: string } }
      | undefined;
    const code = err?.cause?.code;
    const msg =
      err?.name === "AbortError"
        ? "timeout"
        : code === "ENOTFOUND"
          ? "dominio non risolto (DNS)"
          : (err?.message ?? "errore");
    return { ok: false, error: `Unternehmensregister: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
