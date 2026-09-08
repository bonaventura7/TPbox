// ---------- Estonia: e-Äriregister (RIK) — anagrafiche e bilanci gratuiti ----------
// Il registro estone espone, senza chiave e senza login:
//   1. GET https://ariregister.rik.ee/est/api/autocomplete?q=<nome>
//      → JSON { status: "OK", data: [{ reg_code, name, status, ... }] }
//      (servizio esplicitamente senza contratto: "Agreement is not needed for
//      Autocomplete service" — avaandmed.ariregister.rik.ee)
//   2. GET https://ariregister.rik.ee/eng/company/<registrikood>
//      → scheda pubblica: anagrafica + tabella "Annual reports" con i link
//      /eng/company/<codice>/file/<fileId> (PDF) per ogni esercizio +
//      tabella "Graph view" con ricavi e utili per anno.
//   3. GET https://ariregister.rik.ee/eng/company/<codice>/file/<fileId>
//      → il bilancio ufficiale (majandusaasta aruanne): Bilanss e
//      Kasumiaruanne con tutti i valori.
//
// Il registrikood è di 8 cifre e NON coincide con la partita IVA estone
// (EE + 9 cifre): dalla sola IVA si passa dal VIES (nome) e poi
// dall'autocomplete (nome → codice). Nulla di tutto questo richiede
// autenticazione o aggira alcun controllo: sono pagine e API pubbliche.

import { getCountry } from "../../countries";
import type { CompanyProfile, Financials, FinancialYear } from "../../types";
import { checkVat } from "../vies";

const BASE = "https://ariregister.rik.ee";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface EeMatch {
  code: string;
  name: string;
  status?: string | undefined;
  address?: string | undefined;
}

export interface EeFiling {
  year: number;
  submitted?: string | undefined;
  period?: string | undefined;
  status?: string | undefined;
  fileId: string;
}

export interface EeResult {
  ok: boolean;
  profile?: CompanyProfile | undefined;
  financials?: Financials | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

export interface EeFilingResolution {
  ok: boolean;
  fileId?: string | undefined;
  year?: number | undefined;
  error?: string | undefined;
}

export interface EeDocument {
  ok: boolean;
  bytes?: ArrayBuffer | undefined;
  contentType?: string | undefined;
  error?: string | undefined;
}

/** URL pubblica della scheda: usata anche come destinazione documentale. */
export function eeCompanyUrl(code: string): string {
  return `${BASE}/eng/company/${code}`;
}

/** URL pubblica del bilancio di un esercizio (etichettata "PDF" dal registro). */
export function eeFileUrl(code: string, fileId: string): string {
  return `${BASE}/eng/company/${code}/file/${fileId}`;
}

/** Endpoint interno TPBox che serve il bilancio, per anteprima e download. */
export function eeInternalDocumentUrl(code: string, year: number, download: boolean): string {
  return (
    `/api/company-finder/document?country=EE&company=${encodeURIComponent(code)}` +
    `&year=${year}${download ? "&download=1" : ""}`
  );
}

/** Registrikood: 8 cifre pure (nel campo IVA o nella ragione sociale). */
export function eeCodeFromInput(value: string): string | undefined {
  const digits = value.replace(/\D/g, "");
  return /^\d{8}$/.test(digits) ? digits : undefined;
}

/** Parte locale di una partita IVA estone: EE + 9 cifre. */
export function isEeVatLocal(value: string): boolean {
  return /^\d{9}$/.test(value.replace(/\D/g, ""));
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/** Numero in formato estone: "25 814", "-6 737", "2 500,00". */
export function parseEeAmount(raw: string): number | undefined {
  const cleaned = raw
    .replace(/[\s\u00a0]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!/^[-+]?\d+(\.\d+)?$/.test(cleaned)) return undefined;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

async function getText(url: string, signal: AbortSignal, accept: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en;q=0.9,et;q=0.7" },
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`e-Äriregister HTTP ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// 1. Autocomplete: denominazione → registrikood
// ---------------------------------------------------------------------------

interface AutocompleteHit {
  reg_code?: number | string | undefined;
  name?: string | undefined;
  status?: string | undefined;
  legal_address?: string | undefined;
  zip_code?: string | undefined;
}

export function parseAutocomplete(payload: unknown): EeMatch[] {
  const data = (payload as { data?: AutocompleteHit[] | undefined } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: EeMatch[] = [];
  for (const hit of data) {
    const code = String(hit?.reg_code ?? "").replace(/\D/g, "");
    const name = String(hit?.name ?? "").trim();
    if (!/^\d{8}$/.test(code) || !name) continue;
    out.push({
      code,
      name,
      ...(hit?.status ? { status: String(hit.status) } : {}),
      ...(hit?.legal_address
        ? {
            address: [String(hit.legal_address), String(hit?.zip_code ?? "")]
              .filter(Boolean)
              .join(", "),
          }
        : {}),
    });
  }
  return out;
}

export async function searchAutocompleteEe(query: string, signal: AbortSignal): Promise<EeMatch[]> {
  const res = await fetch(`${BASE}/est/api/autocomplete?q=${encodeURIComponent(query.trim())}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`e-Äriregister HTTP ${res.status}`);
  return parseAutocomplete((await res.json()) as unknown);
}

/** Migliore corrispondenza: preferisce il nome che contiene la query. */
export function pickEeMatch(matches: EeMatch[], query: string): EeMatch | undefined {
  if (matches.length === 0) return undefined;
  const q = norm(query);
  return (
    matches.find((m) => norm(m.name) === q) ??
    matches.find((m) => norm(m.name).startsWith(q)) ??
    matches.find((m) => norm(m.name).includes(q)) ??
    matches.find((m) => q.includes(norm(m.name))) ??
    matches[0]
  );
}

// ---------------------------------------------------------------------------
// 2. Scheda società: anagrafica + elenco bilanci + ricavi/utili per anno
// ---------------------------------------------------------------------------

export interface EeCompanyPage {
  legalForm?: string | undefined;
  status?: string | undefined;
  capital?: string | undefined;
  registeredSince?: string | undefined;
  address?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  vatNumber?: string | undefined;
  activityCode?: string | undefined;
  activityLabel?: string | undefined;
  filings: EeFiling[];
  /** anno → { ricavi, utile } dalla tabella "Graph view". */
  figures: Map<number, { revenue?: number | undefined; profit?: number | undefined }>;
}

function fieldAfter(html: string, label: string): string | undefined {
  // Coppie etichetta/valore della scheda ("Legal form … Private limited company").
  // Il markup esatto non è garantito: si prende il primo blocco di testo dopo
  // l'etichetta, in qualunque contenitore (cella, riga di definizione, div…).
  const idx = html.indexOf(label);
  if (idx < 0) return undefined;
  const window = html.slice(idx + label.length, idx + label.length + 900);
  const blocks = Array.from(
    window.matchAll(/<(?:td|th|dd|div|span|p)[^>]*>([\s\S]{0,400}?)<\/(?:td|th|dd|div|span|p)>/gi),
  )
    .map((m) => stripTags(m[1] ?? ""))
    .filter((text) => text && text !== label);
  // Frammenti di un solo carattere (icone, frecce) solo se non c'è altro.
  return blocks.find((text) => text.length >= 2) ?? blocks[0] ?? undefined;
}

/** Righe <tr> della pagina come liste di celle testuali. */
function tableRows(html: string): string[][] {
  return Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map((row) =>
    Array.from((row[1] ?? "").matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((cell) =>
      stripTags(cell[1] ?? ""),
    ),
  );
}

export function parseEeFilings(html: string): EeFiling[] {
  const filings: EeFiling[] = [];
  const seen = new Set<string>();
  for (const rowHtml of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    // Solo la riga con il link PDF (il DDOC è il contenitore firmato, si salta).
    const pdfLink = rowHtml.match(/\/eng\/company\/\d+\/file\/(\d+)(?!([^>]*document_type=ddoc))/i);
    const fileId = pdfLink?.[1];
    if (!fileId || seen.has(fileId)) continue;
    // Anno = unica cella con esattamente 4 cifre (date e periodi non matchano).
    const yearRaw = rowHtml.match(/>\s*((?:19|20)\d{2})\s*</)?.[1];
    const year = yearRaw ? Number(yearRaw) : NaN;
    if (!Number.isInteger(year)) continue;
    seen.add(fileId);
    const cells = stripTags(rowHtml);
    const submitted = cells.match(/\b\d{2}\.\d{2}\.\d{4}\b/)?.[0];
    const period = cells.match(/\b\d{2}\.\d{2}\.\d{4}\s*-\s*\d{2}\.\d{2}\.\d{4}\b/)?.[0];
    const status = /\bValid\b/i.test(cells) ? "Valid" : undefined;
    filings.push({
      year,
      ...(submitted ? { submitted } : {}),
      ...(period ? { period } : {}),
      ...(status ? { status } : {}),
      fileId,
    });
  }
  return filings.sort((a, b) => b.year - a.year);
}

export function parseEeGraphFigures(
  html: string,
): Map<number, { revenue?: number | undefined; profit?: number | undefined }> {
  const figures = new Map<number, { revenue?: number | undefined; profit?: number | undefined }>();
  // Header con gli anni, poi righe "Revenue" e "Profit" (non "Profit margin").
  for (const row of tableRows(html)) {
    if (row.length >= 3 && row[0] === "" && /^(19|20)\d{2}$/.test(row[1] ?? "")) {
      const years = row.slice(1).map(Number);
      const revenueRow = tableRows(html).find((r) => r[0]?.toLowerCase() === "revenue");
      const profitRow = tableRows(html).find(
        (r) => r[0]?.toLowerCase() === "profit" && !/margin/i.test(r[0] ?? ""),
      );
      years.forEach((year, i) => {
        if (!Number.isInteger(year)) return;
        const revenue = revenueRow?.[i + 1] ? parseEeAmount(revenueRow[i + 1]!) : undefined;
        const profit = profitRow?.[i + 1] ? parseEeAmount(profitRow[i + 1]!) : undefined;
        if (revenue !== undefined || profit !== undefined) figures.set(year, { revenue, profit });
      });
      break;
    }
  }
  return figures;
}

export function parseEeCompanyPage(html: string, code: string): EeCompanyPage {
  void code;
  const legalForm = fieldAfter(html, "Legal form");
  const statusRaw = fieldAfter(html, "Status");
  const capitalRaw = fieldAfter(html, "Capital is");
  const registeredRaw = fieldAfter(html, "Registered");
  const address = fieldAfter(html, "Address");
  const emailRaw = fieldAfter(html, "E-mail address");
  const phoneRaw = fieldAfter(html, "Mobile phone");
  const vatNumber = html.match(/\bEE\d{9}\b/)?.[0];
  // Il codice EMTAK (5 cifre) si cerca solo dopo la sua etichetta: un numero
  // a 5 cifre preso alla cieca potrebbe essere il CAP (es. 12011).
  const emtakAt = html.indexOf("EMTAK");
  const emtak =
    emtakAt >= 0 ? html.slice(emtakAt, emtakAt + 3000).match(/>\s*(\d{5})\s*</)?.[1] : undefined;

  const status = statusRaw
    ? /entered into the register/i.test(statusRaw)
      ? "Entered into the register"
      : statusRaw
    : undefined;
  const registeredSince = registeredRaw?.match(/\b\d{2}\.\d{2}\.\d{4}\b/)?.[0];
  const email = emailRaw?.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0];
  const phone = phoneRaw?.match(/\+?\d[\d\s]{5,}/)?.[0]?.trim();

  return {
    ...(legalForm ? { legalForm } : {}),
    ...(status ? { status } : {}),
    ...(capitalRaw ? { capital: capitalRaw } : {}),
    ...(registeredSince ? { registeredSince } : {}),
    ...(address ? { address } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(vatNumber ? { vatNumber } : {}),
    ...(emtak ? { activityCode: emtak } : {}),
    filings: parseEeFilings(html),
    figures: parseEeGraphFigures(html),
  };
}

// ---------------------------------------------------------------------------
// 3. Bilancio: Bilanss + Kasumiaruanne dalla pagina del file
// ---------------------------------------------------------------------------

export interface EeReportValues {
  revenue?: number | undefined;
  netIncome?: number | undefined;
  totalAssets?: number | undefined;
  equity?: number | undefined;
}

export function parseEeAnnualReport(html: string): EeReportValues {
  const values: EeReportValues = {};
  for (const row of tableRows(html)) {
    // Confronto per prefisso: la cella può portare note o rientri oltre
    // all'etichetta ("Kokku varad", "Müügitulu"…).
    const label = (row[0] ?? "").toLowerCase();
    const current = row[1] ? parseEeAmount(row[1]) : undefined;
    if (current === undefined) continue;
    if (label.startsWith("kokku varad")) values.totalAssets = current;
    else if (label.startsWith("kokku omakapital")) values.equity = current;
    else if (label.startsWith("müügitulu")) values.revenue = current;
    else if (label.startsWith("aruandeaasta kasum (kahjum)")) values.netIncome = current;
  }
  return values;
}

// ---------------------------------------------------------------------------
// Risoluzione del codice + fetch combinato scheda/bilanci
// ---------------------------------------------------------------------------

export interface EeLookupInput {
  query: string;
  localVat: string;
}

async function resolveCode(
  input: EeLookupInput,
  signal: AbortSignal,
): Promise<{
  code?: string | undefined;
  matchName?: string | undefined;
  error?: string | undefined;
}> {
  const direct = eeCodeFromInput(input.localVat) ?? eeCodeFromInput(input.query);
  if (direct) return { code: direct };

  let name = input.query.trim();
  if (name.length < 2 && isEeVatLocal(input.localVat)) {
    // Dalla sola IVA non si ricava il codice: il VIES dà il nome ufficiale,
    // l'autocomplete lo converte in registrikood.
    const vies = await checkVat("EE", input.localVat.replace(/\D/g, ""));
    if (vies.ok && vies.data?.name) name = vies.data.name;
  }
  if (name.length < 2) {
    return {
      error:
        "serve la denominazione o il registrikood (8 cifre); la sola partita IVA estone non basta a individuare la scheda",
    };
  }
  const matches = await searchAutocompleteEe(name, signal);
  const best = pickEeMatch(matches, name);
  if (!best) return { error: "nessuna società estone corrisponde alla denominazione" };
  return { code: best.code, matchName: best.name };
}

function buildProfile(
  code: string,
  page: EeCompanyPage,
  matchName: string | undefined,
  pageHtml: string,
): CompanyProfile {
  const titleName = pageHtml.match(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/i)?.[1];
  const title = titleName ? stripTags(titleName).replace(/\s*\(\d{8}\)\s*$/, "") : "";
  const name = title || matchName || code;
  const country = getCountry("EE")!;
  return {
    name,
    nameSource: "e-Äriregister (RIK)",
    country,
    registry: {
      name: "Äriregister (e-Äriregister)",
      authority: "Registrite ja Infosüsteemide Keskus (RIK)",
      id: `Registrikood ${code}`,
    },
    ...(page.legalForm ? { legalForm: page.legalForm } : {}),
    ...(page.status ? { status: page.status } : {}),
    ...(page.registeredSince ? { registeredSince: page.registeredSince } : {}),
    ...(page.address ? { address: page.address } : {}),
    ...(page.email ? { email: page.email } : {}),
    ...(page.capital ? { capital: page.capital } : {}),
    ...(page.activityCode
      ? {
          activityCodes: [
            {
              code: page.activityCode,
              ...(page.activityLabel ? { label: page.activityLabel } : {}),
            },
          ],
        }
      : {}),
    identifiers: [
      { key: "Registrikood", value: code },
      ...(page.vatNumber ? [{ key: "IVA", value: page.vatNumber }] : []),
    ],
  };
}

function buildYears(
  filings: EeFiling[],
  figures: EeCompanyPage["figures"],
  latest: EeReportValues,
): FinancialYear[] {
  return filings.map((filing, index) => {
    const figure = figures.get(filing.year);
    const year: FinancialYear = {
      periodLabel: filing.period
        ? `Esercizio ${filing.year} (${filing.period})`
        : `Esercizio ${filing.year}`,
      year: filing.year,
      currency: "EUR",
    };
    const revenue = index === 0 && latest.revenue !== undefined ? latest.revenue : figure?.revenue;
    const netIncome =
      index === 0 && latest.netIncome !== undefined ? latest.netIncome : figure?.profit;
    if (revenue !== undefined) year.revenue = revenue;
    if (netIncome !== undefined) year.netIncome = netIncome;
    if (index === 0) {
      if (latest.totalAssets !== undefined) year.totalAssets = latest.totalAssets;
      if (latest.equity !== undefined) year.equity = latest.equity;
    }
    return year;
  });
}

/**
 * Scheda + bilanci dell'Estonia in un solo passaggio: risolve il codice,
 * legge la scheda (esercizi e valori) e il bilancio più recente (stato
 * patrimoniale). Il documento è servito in pagina dall'endpoint interno.
 */
export async function fetchEeFinancials(
  input: EeLookupInput,
  timeoutMs = 22000,
): Promise<EeResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resolved = await resolveCode(input, ctrl.signal);
    if (!resolved.code) return { ok: false, skipped: resolved.error ?? "codice non risolvibile" };
    const code = resolved.code;

    const pageHtml = await getText(
      eeCompanyUrl(code),
      ctrl.signal,
      "text/html,application/xhtml+xml",
    );
    const page = parseEeCompanyPage(pageHtml, code);
    const profile = buildProfile(code, page, resolved.matchName, pageHtml);

    if (page.filings.length === 0) {
      return {
        ok: true,
        profile,
        financials: {
          available: false,
          years: [],
          source: `e-Äriregister (registrikood ${code})`,
          note: "Nessun bilancio risulta depositato nella scheda pubblica della società (tabella Annual reports vuota).",
        },
      };
    }

    // Stato patrimoniale dell'esercizio più recente, best-effort: se la
    // pagina del file non risponde, restano esercizi, ricavi e utili.
    let latest: EeReportValues = {};
    try {
      const latestFiling = page.filings[0]!;
      const fileHtml = await getText(
        eeFileUrl(code, latestFiling.fileId),
        ctrl.signal,
        "text/html,application/xhtml+xml",
      );
      latest = parseEeAnnualReport(fileHtml);
    } catch {
      latest = {};
    }

    const years = buildYears(page.filings, page.figures, latest);
    const hasValues = years.some(
      (y) => y.revenue !== undefined || y.netIncome !== undefined || y.totalAssets !== undefined,
    );
    const newest = page.filings[0]!;
    const data: Financials = {
      available: hasValues,
      currency: "EUR",
      years,
      source: `e-Äriregister (registrikood ${code}) — Registrite ja Infosüsteemide Keskus`,
      documentUrl: eeInternalDocumentUrl(code, newest.year, false),
      documentTitle: `Majandusaasta aruanne ${newest.year} — ${profile.name ?? code}`,
      availability: "DOCUMENT_DOWNLOADABLE",
      note:
        `Bilanci ufficiali gratuiti, ${page.filings.length} esercizi depositati` +
        (page.filings.length > 1
          ? ` (${page.filings[page.filings.length - 1]!.year}–${newest.year})`
          : "") +
        ". Il documento più recente è mostrato in anteprima e scaricabile; gli altri esercizi sono nell'elenco.",
      documents: page.filings.slice(0, 12).map((filing) => ({
        id: `EE-${code}-${filing.year}`,
        year: filing.year,
        kind: "ANNUAL_REPORT" as const,
        format: "pdf" as const,
        availability: "DOCUMENT_DOWNLOADABLE" as const,
        title: `Majandusaasta aruanne ${filing.year}${filing.period ? ` (${filing.period})` : ""}`,
        downloadUrl: eeInternalDocumentUrl(code, filing.year, true),
      })),
    };
    return { ok: true, profile, financials: data };
  } catch (e) {
    const err = e as { name?: string | undefined; message?: string | undefined };
    return {
      ok: false,
      error:
        err?.name === "AbortError"
          ? "e-Äriregister: timeout"
          : (err?.message ?? "e-Äriregister: errore di rete"),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Endpoint di download: anno → fileId → documento ufficiale
// ---------------------------------------------------------------------------

interface FilingCacheEntry {
  filings: EeFiling[];
  expiresAt: number;
}

const filingCache = new Map<string, FilingCacheEntry>();
const FILING_CACHE_TTL_MS = 10 * 60 * 1000;

/** Solo per i test: isola la cache tra i casi. */
export function resetEeFilingCache(): void {
  filingCache.clear();
}

export async function resolveEeFiling(
  code: string,
  year: number,
  timeoutMs = 20000,
): Promise<EeFilingResolution> {
  if (!/^\d{8}$/.test(code)) return { ok: false, error: "registrikood non valido" };
  const cached = filingCache.get(code);
  let filings = cached && cached.expiresAt > Date.now() ? cached.filings : undefined;
  if (!filings) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const pageHtml = await getText(
        eeCompanyUrl(code),
        ctrl.signal,
        "text/html,application/xhtml+xml",
      );
      filings = parseEeFilings(pageHtml);
      filingCache.set(code, { filings, expiresAt: Date.now() + FILING_CACHE_TTL_MS });
    } catch (e) {
      const err = e as { name?: string | undefined; message?: string | undefined };
      return {
        ok: false,
        error:
          err?.name === "AbortError"
            ? "e-Äriregister: timeout"
            : (err?.message ?? "scheda non raggiungibile"),
      };
    } finally {
      clearTimeout(timer);
    }
  }
  const filing = filings.find((f) => f.year === year);
  if (!filing) {
    return {
      ok: false,
      error:
        filings.length === 0
          ? `nessun bilancio depositato per il registrikood ${code}`
          : `bilancio ${year} non depositato (esercizi disponibili: ${filings.map((f) => f.year).join(", ")})`,
    };
  }
  return { ok: true, fileId: filing.fileId, year };
}

function isPdfBytes(bytes: ArrayBuffer): boolean {
  return new TextDecoder("latin1").decode(new Uint8Array(bytes).slice(0, 8)).startsWith("%PDF-");
}

export async function fetchEeFileDocument(
  code: string,
  fileId: string,
  timeoutMs = 25000,
): Promise<EeDocument> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Il registro etichetta il link "PDF": lo si chiede come PDF; se risponde
    // con la pagina HTML del bilancio la si serve così com'è — è comunque il
    // documento ufficiale completo, visibile e scaricabile.
    const res = await fetch(eeFileUrl(code, fileId), {
      headers: { "User-Agent": UA, Accept: "application/pdf,text/html,application/xhtml+xml,*/*" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `e-Äriregister HTTP ${res.status}` };
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength < 8) return { ok: false, error: "documento vuoto" };
    if (bytes.byteLength > 30 * 1024 * 1024) return { ok: false, error: "documento troppo grande" };
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (isPdfBytes(bytes) || contentType.includes("pdf")) {
      return { ok: true, bytes, contentType: "application/pdf" };
    }
    const head = new TextDecoder("utf-8").decode(new Uint8Array(bytes).slice(0, 400)).trimStart();
    if (contentType.includes("html") || /^<!doctype html|^<html[\s>]/i.test(head)) {
      return { ok: true, bytes, contentType: "text/html; charset=utf-8" };
    }
    return { ok: false, error: "formato del documento non riconosciuto" };
  } catch (e) {
    const err = e as { name?: string | undefined; message?: string | undefined };
    return {
      ok: false,
      error:
        err?.name === "AbortError"
          ? "e-Äriregister: timeout"
          : (err?.message ?? "documento non raggiungibile"),
    };
  } finally {
    clearTimeout(timer);
  }
}
