// ---------- Belgio: Pappers.be — scheda pubblica gratuita ----------
// Stessa strategia dell'adapter FR (pappers-public-fr.server.ts): fetch
// diretto della pagina pubblica + fallback via reader se l'IP server viene
// bloccato. Nessuna chiave, nessun login: la consultazione delle schede è
// gratuita (fonti dichiarate da Pappers.be: BCE/KBO, conti annuali BNB,
// Moniteur belge).
//
// La pagina Nuxt espone in SSR: anagrafica BCE, tabella Finances (CA, EBITDA,
// risultato netto, fondi propri per esercizio) ed elenco Comptes annuels.
// I pulsanti "Télécharger le fichier PDF" sono guidati da JS: se nel markup
// compaiono ancore PDF dirette si servono in pagina via proxy interno,
// altrimenti i depositi si dichiarano come DOCUMENT_FOUND (riferimento noto,
// download sulla pagina ufficiale o via NBB con chiave). Mai link inventati.

import { getCountry } from "../../countries";
import type {
  CompanyProfile,
  FinancialDocumentSummary,
  Financials,
  FinancialYear,
} from "../../types";

const PAPPERS_BE_BASE = "https://www.pappers.be";
const PAPPERS_READER = "https://r.jina.ai/http://";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 22_000;
const MAX_DOCUMENTS = 12;

export interface BePappersInput {
  query: string;
  localVat: string;
}

export interface BePappersResult {
  ok: boolean;
  profile?: CompanyProfile | undefined;
  financials?: Financials | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

export interface BeYearValues {
  revenue?: number | undefined;
  ebitda?: number | undefined;
  operatingProfit?: number | undefined;
  netIncome?: number | undefined;
  equity?: number | undefined;
}

export interface BeFiling {
  year: number;
  kind: "sociaux" | "consolidés";
  title: string;
  deposited?: string | undefined;
  pdfUrl?: string | undefined;
}

// ---------------------------------------------------------------------------
// URL e slug
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** CBE (10 cifre) dal campo partita IVA: per il BE l'IVA = BE + CBE. */
export function cbeFromBeInput(localVat: string): string | undefined {
  const digits = localVat.replace(/\D/g, "");
  return /^\d{10}$/.test(digits) ? digits : undefined;
}

export function pappersBeCompanyUrl(slug: string, cbe: string): string {
  return `${PAPPERS_BE_BASE}/fr/company/${slug}-${cbe}`;
}

/** Slug candidati: prima quello dal nome, poi quello generico. */
export function pappersBeSlugs(query: string): string[] {
  const slugged = slugify(query.trim());
  const out = slugged.length >= 2 ? [slugged] : [];
  if (!out.includes("entreprise")) out.push("entreprise");
  return out;
}

function dottedCbe(cbe: string): string {
  return `${cbe.slice(0, 4)}.${cbe.slice(4, 7)}.${cbe.slice(7)}`;
}

// ---------------------------------------------------------------------------
// Testo e importi
// ---------------------------------------------------------------------------

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** HTML → testo con righe: i blocchi diventano newline, per i campi label/valore. */
export function htmlToTextLines(html: string): string[] {
  const withBreaks = html
    .replace(/<\/(p|div|h[1-6]|li|tr|dd|dt|section|article|header|footer|table|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  return decodeEntities(withBreaks.replace(/<[^>]*>/g, ""))
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0);
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Importo in formato belga/francese: "34,4 M", "-4,62", "34 370 497,51 €".
 * Suffisso M = milioni. Senza suffisso il valore è preso alla lettera: le
 * tabelle Pappers arrotondano al milione con suffisso, i totali esatti
 * portano il simbolo €.
 */
export function parseBeAmount(raw: string): number | undefined {
  // \s copre anche nbsp e spazi unificatori usati come separatori di migliaia.
  const cleaned = raw.replace(/€/g, "").replace(/\s/g, "").trim();
  if (!cleaned || /^(-|—|n\.?d\.?|…)$/i.test(cleaned)) return undefined;
  const million = /m$/i.test(cleaned);
  const numeric = cleaned.replace(/m$/i, "").replace(/\./g, "").replace(",", ".");
  if (!/^[-+]?\d+(\.\d+)?$/.test(numeric)) return undefined;
  const value = Number(numeric) * (million ? 1_000_000 : 1);
  return Number.isFinite(value) ? value : undefined;
}

// ---------------------------------------------------------------------------
// Tabella Finances (HTML e markdown)
// ---------------------------------------------------------------------------

function tableRows(html: string): string[][] {
  return Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map((row) =>
    Array.from((row[1] ?? "").matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((cell) =>
      stripTags(cell[1] ?? ""),
    ),
  );
}

function markdownRows(markdown: string): string[][] {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter((cells) => cells.length >= 3 && !cells.every((cell) => /^:?-+:?$/.test(cell)));
}

const BE_ROW_LABELS: Record<string, keyof BeYearValues> = {
  "chiffre d'affaires": "revenue",
  "ebitda - ebe": "ebitda",
  "resultat d'exploitation": "operatingProfit",
  "resultat net": "netIncome",
  "fonds propres": "equity",
};

function isYearCell(cell: string): boolean {
  return /^(19|20)\d{2}$/.test(cell);
}

/** Anni dall'intestazione + valori dalle righe in euro. */
export function parseBeFinanceTable(rows: string[][]): Map<number, BeYearValues> {
  const out = new Map<number, BeYearValues>();
  let years: number[] = [];
  for (const row of rows) {
    const start = row.findIndex((cell, i) => i > 0 && row.slice(i).every(isYearCell));
    if (start > 0 && years.length === 0) {
      years = row.slice(start).map(Number);
      continue;
    }
  }
  if (years.length === 0) return out;
  for (const row of rows) {
    const key = BE_ROW_LABELS[norm(row[0] ?? "")];
    if (!key) continue;
    const unit = norm(row[1] ?? "");
    if (unit === "%" || unit.includes("pourcent")) continue;
    const values = row.slice(2);
    if (values.length < years.length) continue;
    years.forEach((year, i) => {
      const amount = parseBeAmount(values[i] ?? "");
      if (amount === undefined) return;
      const entry = out.get(year) ?? {};
      entry[key] = amount;
      out.set(year, entry);
    });
  }
  return out;
}

export function parseBeFinanceHtml(html: string): Map<number, BeYearValues> {
  return parseBeFinanceTable(tableRows(html));
}

export function parseBeFinanceMarkdown(markdown: string): Map<number, BeYearValues> {
  return parseBeFinanceTable(markdownRows(markdown));
}

/**
 * Ricavi esatti dall'intestazione della scheda ("Chiffre d'affaires 2025
 * 34 370 497,51 €"): prevalgono sugli arrotondamenti della tabella.
 */
export function parseBeExactRevenue(text: string): Map<number, number> {
  const out = new Map<number, number>();
  const pattern = /Chiffre d'affaires\s+(20\d{2})\s+([\d\s.,]+?)\s*€/g;
  for (const match of text.matchAll(pattern)) {
    const year = Number(match[1]);
    const amount = parseBeAmount(match[2] ?? "");
    if (Number.isInteger(year) && amount !== undefined && !out.has(year)) out.set(year, amount);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Anagrafica
// ---------------------------------------------------------------------------

function fieldAfter(lines: string[], label: string, sameLine = false): string | undefined {
  const needle = norm(label);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const n = norm(line);
    if (n === needle) {
      const next = lines[i + 1]?.trim();
      return next && next.length <= 300 ? next : undefined;
    }
    if (sameLine && n.startsWith(`${needle} `)) {
      const rest = line.slice(label.length).trim();
      return rest ? rest : undefined;
    }
  }
  return undefined;
}

function beforeBullet(value: string): string {
  return value.split("•")[0]?.trim() ?? value;
}

export function parseBeCompanyName(html: string): string {
  const h1 = html.match(/<h1[^>]*>([\s\S]{1,200}?)<\/h1>/i)?.[1];
  if (h1) return stripTags(h1);
  const md = html.match(/^#\s+(.+)$/m)?.[1];
  return (md ?? "").trim();
}

export function buildBeProfile(
  page: string,
  cbe: string,
  isMarkdown: boolean,
): CompanyProfile | undefined {
  const text = isMarkdown ? page : htmlToTextLines(page).join("\n");
  // Fail-closed: la pagina deve riferirsi a questo CBE, in forma punteggiata
  // (0442.824.497) o piana (0442824497). Mai la scheda di un'altra società.
  if (!text.includes(dottedCbe(cbe)) && !text.includes(cbe)) return undefined;

  const lines = text.split("\n");
  const html = isMarkdown ? "" : page;
  const name = isMarkdown ? parseBeCompanyName(page) : parseBeCompanyName(html);
  const country = getCountry("BE")!;
  const address = fieldAfter(lines, "Adresse");
  const legalForm = fieldAfter(lines, "Forme juridique");
  const situation = fieldAfter(lines, "Situation juridique");
  const created = fieldAfter(lines, "Création");
  const capital = fieldAfter(lines, "Capital social");
  const naceRaw = fieldAfter(lines, "Code NACEBEL");
  const nace = naceRaw?.match(/\d{2}\.\d{2,3}/)?.[0];
  const vatNumber = text.match(/\bBE\d{10}\b/)?.[0];
  const euid = text.match(/\bBEKBOBCE\.[\d.]+\b/)?.[0];
  const updated = text.match(/Dernière mise à jour BCE\s*:?\s*(\d{2}\/\d{2}\/\d{4})/)?.[1];

  return {
    name: name || `BCE ${dottedCbe(cbe)}`,
    nameSource: "Pappers.be (dati BCE)",
    country,
    registry: {
      name: "Banque-Carrefour des Entreprises (BCE/KBO)",
      authority: "Crossroads Bank for Enterprises",
      id: `BCE ${dottedCbe(cbe)}`,
    },
    ...(legalForm ? { legalForm: beforeBullet(legalForm) } : {}),
    ...(situation ? { status: beforeBullet(situation) } : {}),
    ...(situation ? { statusRaw: situation } : {}),
    ...(created ? { registeredSince: created } : {}),
    ...(updated ? { lastRegistryUpdate: updated } : {}),
    ...(address ? { address: beforeBullet(address) } : {}),
    ...(capital ? { capital } : {}),
    ...(nace ? { activityCodes: [{ code: nace }] } : {}),
    identifiers: [
      { key: "BCE/KBO", value: dottedCbe(cbe) },
      ...(vatNumber ? [{ key: "IVA", value: vatNumber }] : []),
      ...(euid ? [{ key: "EUID", value: euid }] : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// Elenco Comptes annuels (+ ancore PDF best-effort)
// ---------------------------------------------------------------------------

const ANCHOR_PATTERN = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;

function isPappersBePdf(href: string, pageUrl: string): string | undefined {
  try {
    const absolute = new URL(href, pageUrl);
    if (absolute.hostname.toLowerCase() !== "www.pappers.be") return undefined;
    if (!/\.pdf($|[?#])/i.test(absolute.pathname + absolute.search)) return undefined;
    return absolute.toString();
  } catch {
    return undefined;
  }
}

function yearFrom(value: string): number | undefined {
  const match = value.match(/(?:^|[^0-9])(20\d{2})(?:[^0-9]|$)/);
  return match ? Number(match[1]) : undefined;
}

/** Ancore PDF dirette, se il markup le espone (anno dal contesto). */
export function parseBePdfAnchors(html: string, pageUrl: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const match of html.matchAll(ANCHOR_PATTERN)) {
    const pdf = isPappersBePdf(match[2] ?? "", pageUrl);
    if (!pdf) continue;
    const year = yearFrom(`${match[1] ?? ""} ${match[3] ?? ""} ${match[4] ?? ""} ${pdf}`);
    if (year && !out.has(year)) out.set(year, pdf);
  }
  return out;
}

export function parseBeFilings(text: string, pdfs?: Map<number, string>): BeFiling[] {
  const out: BeFiling[] = [];
  const seen = new Set<string>();
  const pattern = /Comptes (sociaux|consolidés)\s+(20\d{2})/g;
  for (const match of text.matchAll(pattern)) {
    const kind = match[1] === "consolidés" ? ("consolidés" as const) : ("sociaux" as const);
    const year = Number(match[2]);
    const key = `${year}-${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const after = text.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + 60);
    const deposited = after.match(/(\d{2}\/\d{2}\/\d{4})/)?.[1];
    const title = kind === "sociaux" ? `Comptes sociaux ${year}` : `Comptes consolidés ${year}`;
    out.push({
      year,
      kind,
      title: deposited ? `${title} — déposé le ${deposited}` : title,
      ...(deposited ? { deposited } : {}),
      ...(pdfs?.get(year) ? { pdfUrl: pdfs.get(year)! } : {}),
    });
  }
  return out
    .sort((a, b) => b.year - a.year || a.kind.localeCompare(b.kind))
    .slice(0, MAX_DOCUMENTS);
}

// ---------------------------------------------------------------------------
// Fetch (diretto + reader)
// ---------------------------------------------------------------------------

function toInternalBeProxyUrl(pdfUrl: string): string {
  return `/api/company-finder/document?url=${encodeURIComponent(pdfUrl)}`;
}

async function fetchDirect(
  pageUrl: string,
  signal: AbortSignal,
): Promise<{ html: string; finalUrl: string; status: number }> {
  const response = await fetch(pageUrl, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "fr-BE,fr;q=0.9,nl;q=0.7,en;q=0.5",
    },
    signal,
    redirect: "follow",
    cache: "no-store",
  });
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_HTML_BYTES) throw new Error("pagina Pappers.be troppo grande");
  return {
    html: new TextDecoder("utf-8").decode(bytes),
    finalUrl: response.url || pageUrl,
    status: response.status,
  };
}

async function fetchViaReader(pageUrl: string, signal: AbortSignal): Promise<string> {
  const readerUrl = `${PAPPERS_READER}${pageUrl.replace(/^https?:\/\//i, "")}`;
  const response = await fetch(readerUrl, {
    headers: {
      Accept: "text/plain,text/markdown,text/html;q=0.9,*/*;q=0.8",
      "User-Agent": "TPbox-CompanyFinder/1.0",
    },
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Pappers.be reader HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_HTML_BYTES) throw new Error("reader Pappers.be troppo grande");
  return new TextDecoder("utf-8").decode(bytes);
}

// ---------------------------------------------------------------------------
// Assemblaggio
// ---------------------------------------------------------------------------

function buildYears(
  values: Map<number, BeYearValues>,
  exactRevenue: Map<number, number>,
): FinancialYear[] {
  const years = [...new Set([...values.keys(), ...exactRevenue.keys()])].sort((a, b) => b - a);
  return years.map((year) => {
    const v = values.get(year) ?? {};
    const revenue = exactRevenue.get(year) ?? v.revenue;
    const out: FinancialYear = { periodLabel: `Esercizio ${year}`, year, currency: "EUR" };
    if (revenue !== undefined) out.revenue = revenue;
    if (v.ebitda !== undefined) out.ebitda = v.ebitda;
    if (v.operatingProfit !== undefined) out.operatingProfit = v.operatingProfit;
    if (v.netIncome !== undefined) out.netIncome = v.netIncome;
    if (v.equity !== undefined) out.equity = v.equity;
    return out;
  });
}

function toSummaries(filings: BeFiling[], cbe: string): FinancialDocumentSummary[] {
  return filings.map((filing) => {
    const downloadable = Boolean(filing.pdfUrl);
    return {
      id: `BE-${cbe}-${filing.year}-${filing.kind === "sociaux" ? "soc" : "con"}`,
      year: filing.year,
      kind: "ANNUAL_REPORT" as const,
      format: "pdf" as const,
      availability: downloadable ? "DOCUMENT_DOWNLOADABLE" : "DOCUMENT_FOUND",
      title: filing.title,
      ...(downloadable ? { downloadUrl: toInternalBeProxyUrl(filing.pdfUrl!) } : {}),
    };
  });
}

/**
 * Scheda + bilanci del Belgio dalla pagina pubblica Pappers.be: un solo fetch
 * per anagrafica, valori per esercizio ed elenco dei conti depositati.
 * Senza chiave, senza login.
 */
export async function fetchBePappers(
  input: BePappersInput,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<BePappersResult> {
  const cbe = cbeFromBeInput(input.localVat);
  if (!cbe) {
    return {
      ok: false,
      skipped: "serve il CBE (numero di impresa, 10 cifre) nel campo partita IVA (BE + CBE)",
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const slugs = pappersBeSlugs(input.query);
    let page: { body: string; finalUrl: string; markdown: boolean } | undefined;
    let blocked = false;
    let answered = false;

    for (const slug of slugs) {
      const url = pappersBeCompanyUrl(slug, cbe);
      let direct: { html: string; finalUrl: string; status: number } | undefined;
      try {
        direct = await fetchDirect(url, controller.signal);
      } catch (error) {
        if ((error as { name?: string } | undefined)?.name === "AbortError") throw error;
        direct = undefined;
      }
      if (!direct) continue;
      answered = true;
      // 403 = IP server bloccato (non slug sbagliato): inutile ritentare diretto.
      if (direct.status === 403) {
        blocked = true;
        break;
      }
      if (direct.status === 200 && buildBeProfile(direct.html, cbe, false)) {
        page = { body: direct.html, finalUrl: direct.finalUrl, markdown: false };
        break;
      }
    }

    // Pappers può bloccare gli IP server-side con HTTP 403 (o chiudere la
    // connessione): come per la FR, si ripiega sul reader pubblico — stessa
    // pagina pubblica, nessun login. I 404 puliti (CBE inesistente) non
    // ritentano: errore secco invece di traffico inutile.
    if (!page && (blocked || !answered)) {
      try {
        const markdown = await fetchViaReader(
          pappersBeCompanyUrl(slugs[0] ?? "entreprise", cbe),
          controller.signal,
        );
        if (buildBeProfile(markdown, cbe, true)) {
          page = { body: markdown, finalUrl: "", markdown: true };
        }
      } catch {
        page = undefined;
      }
    }

    if (!page) {
      return { ok: false, error: "Pappers.be: nessuna scheda trovata per questo CBE" };
    }

    const profile = buildBeProfile(page.body, cbe, page.markdown)!;
    const text = page.markdown ? page.body : htmlToTextLines(page.body).join("\n");
    const values = page.markdown
      ? parseBeFinanceMarkdown(page.body)
      : parseBeFinanceHtml(page.body);
    const exactRevenue = parseBeExactRevenue(text);
    const pdfs = page.markdown ? undefined : parseBePdfAnchors(page.body, page.finalUrl);
    const filings = parseBeFilings(text, pdfs);
    const years = buildYears(values, exactRevenue);
    const hasValues = years.some(
      (y) =>
        y.revenue !== undefined ||
        y.netIncome !== undefined ||
        y.equity !== undefined ||
        y.ebitda !== undefined ||
        y.operatingProfit !== undefined,
    );
    const summaries = toSummaries(filings, cbe);
    const primaryDoc = summaries.find((d) => d.downloadUrl);

    if (years.length === 0 && filings.length === 0) {
      return {
        ok: true,
        profile,
        financials: {
          available: false,
          years: [],
          currency: "EUR",
          source: "Pappers.be — scheda pubblica (dati BCE/BNB)",
          note: "La scheda pubblica non espone valori né conti depositati per questa impresa.",
        },
      };
    }

    return {
      ok: true,
      profile,
      financials: {
        available: hasValues,
        years,
        currency: "EUR",
        source: "Pappers.be — scheda pubblica (dati BCE/BNB)",
        availability: primaryDoc
          ? "DOCUMENT_DOWNLOADABLE"
          : filings.length > 0
            ? "DOCUMENT_FOUND"
            : undefined,
        documents: summaries,
        ...(primaryDoc?.downloadUrl ? { documentUrl: primaryDoc.downloadUrl } : {}),
        ...(primaryDoc?.title ? { documentTitle: primaryDoc.title } : {}),
        note:
          "Valori per esercizio ed elenco dei conti depositati dalla scheda pubblica gratuita Pappers.be (fonte secondaria: BCE/KBO e conti BNB). " +
          (primaryDoc
            ? "Il documento più recente è mostrato in anteprima e scaricabile."
            : "I PDF dei conti si scaricano dalla pagina ufficiale; con la chiave gratuita NBB-CBSO il tool serve in pagina anche il PDF ufficiale NBB."),
      },
    };
  } catch (error) {
    const err = error as { name?: string | undefined; message?: string | undefined };
    return {
      ok: false,
      error:
        err?.name === "AbortError"
          ? "Pappers.be: timeout"
          : (err?.message ?? "Pappers.be: errore di rete"),
    };
  } finally {
    clearTimeout(timer);
  }
}
