// ---------- Luxembourg RCSL — comptes annuels pubblici ----------
// Strategia: risolviamo l'RCS (B12345), individuiamo i depositi e usiamo
// i permalink ufficiali gd.lu/rcsl/... come documento sorgente. La pagina
// Pappers Luxembourg è usata solo come discovery pubblica quando il portale
// LBR non espone direttamente i link nel contenuto server-side.
// Nessun login, CAPTCHA, WAF o controllo del registro viene aggirato.

import type { DocumentAvailability, FinancialDocumentSummary, Financials } from "../../types";
import { searchGleif } from "../gleif";

const LBR_BASE = "https://www.lbr.lu";
const PAPPERS_BASE = "https://www.pappers.lu";
const READER_BASE = "https://r.jina.ai/http://";
const GD_BASE = "https://gd.lu";
const RCS_AUTHORITY = "RA000432";
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20_000;
const UA = "TPbox-CompanyFinder/1.0";

export interface LuxembourgDocument {
  url: string;
  year: number;
  title: string;
}

export interface LuxembourgResult {
  ok: boolean;
  rcs?: string;
  companyName?: string;
  data?: Financials;
  error?: string;
  skipped?: string;
}

function normalizeRcs(value: string): string | undefined {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/^LURCSL\.?/i, "")
    .replace(/[\s.\-]/g, "");
  return /^B\d+$/.test(normalized) ? normalized : undefined;
}

export function luxembourgRcsFromInput(value: string): string | undefined {
  return normalizeRcs(value);
}

export function luxembourgCompanyUrl(value: string): string {
  const rcs = normalizeRcs(value) ?? value.trim();
  return `${LBR_BASE}/mjrcs-web-front/consult-company/${encodeURIComponent(rcs)}?tab=deposit`;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanText(value: string): string {
  return decodeHtml(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function yearFrom(text: string): number | undefined {
  const match = text.match(/(?:^|[^0-9])(20\d{2})(?:[^0-9]|$)/);
  return match ? Number(match[1]) : undefined;
}

function isOfficialGdLu(value: string): boolean {
  try {
    const url = new URL(value, GD_BASE);
    return url.protocol === "https:" && url.hostname.toLowerCase() === "gd.lu" && /^\/rcsl\//i.test(url.pathname);
  } catch {
    return false;
  }
}

function extractGdLuLinks(html: string): LuxembourgDocument[] {
  const out: LuxembourgDocument[] = [];
  const seen = new Set<string>();
  const anchors = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchors)) {
    const href = decodeHtml(match[2] ?? "").trim();
    const body = cleanText(match[4] ?? "");
    if (!href || !isOfficialGdLu(href)) continue;
    const absolute = new URL(href, GD_BASE).toString();
    if (seen.has(absolute)) continue;
    const context = `${href} ${body} ${match[1] ?? ""} ${match[3] ?? ""}`;
    if (!/compte|annual|social|comptes/i.test(context)) continue;
    const year = yearFrom(context);
    if (!year) continue;
    seen.add(absolute);
    out.push({ url: absolute, year, title: body || `Comptes annuels ${year}` });
  }
  return out.sort((a, b) => b.year - a.year || a.title.localeCompare(b.title, "fr"));
}

export function parseLuxembourgPappersIndex(html: string): LuxembourgDocument[] {
  return extractGdLuLinks(html);
}

async function getText(url: string, signal: AbortSignal): Promise<{ text: string; status: number; finalUrl: string }> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    },
    redirect: "follow",
    signal,
    cache: "no-store",
  });
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_HTML_BYTES) throw new Error("pagina sorgente troppo grande");
  return {
    text: new TextDecoder("utf-8").decode(bytes),
    status: response.status,
    finalUrl: response.url || url,
  };
}

function pappersCompanyUrl(companyName: string, rcs: string): string {
  const slug = companyName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${PAPPERS_BASE}/company/${slug}-${rcs}`;
}

async function discoveryPages(companyName: string, rcs: string, signal: AbortSignal): Promise<LuxembourgDocument[]> {
  const urls = [luxembourgCompanyUrl(rcs), pappersCompanyUrl(companyName, rcs)];
  for (const pageUrl of urls) {
    try {
      const direct = await getText(pageUrl, signal);
      if (direct.status === 200) {
        const docs = extractGdLuLinks(direct.text);
        if (docs.length) return docs;
      }
    } catch {
      // Prova il reader o la pagina successiva.
    }
    try {
      const readerUrl = `${READER_BASE}${pageUrl.replace(/^https?:\/\//i, "")}`;
      const reader = await getText(readerUrl, signal);
      if (reader.status === 200) {
        const docs = extractGdLuLinks(reader.text);
        if (docs.length) return docs;
      }
    } catch {
      // Degradazione controllata: il caller fornirà la pagina LBR ufficiale.
    }
  }
  return [];
}

export function toInternalLuxembourgDocuments(
  rcsInput: string,
  documents: LuxembourgDocument[],
): FinancialDocumentSummary[] {
  const rcs = normalizeRcs(rcsInput) ?? rcsInput.trim();
  return documents.map((document) => ({
    id: `lu-${rcs}-${document.year}`,
    year: document.year,
    kind: "ANNUAL_REPORT" as const,
    format: "pdf" as const,
    availability: "DOCUMENT_DOWNLOADABLE" as DocumentAvailability,
    title: document.title,
    downloadUrl: `/api/company-finder/document?country=LU&company=${encodeURIComponent(rcs)}&year=${document.year}`,
  }));
}

export async function resolveLuxembourgRcsByName(
  companyName: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ rcs?: string; name?: string; detail?: string }> {
  const term = companyName.trim();
  if (term.length < 3) return { detail: "nome troppo corto per la risoluzione RCS" };
  const result = await searchGleif(term, "LU", timeoutMs);
  if (!result.ok) return { detail: result.error ?? "resolver GLEIF non raggiungibile" };

  for (const match of result.matches) {
    if (match.country !== "LU") continue;
    if (match.registeredAt && match.registeredAt !== RCS_AUTHORITY) continue;
    const rcs = normalizeRcs(match.registeredAs ?? "");
    if (rcs) return { rcs, name: match.name, detail: `${rcs} risolto da GLEIF` };
  }
  return { detail: "nessuna entità lussemburghese con identificativo RCS verificabile" };
}

export async function findLuxembourgAnnualReport(
  companyName: string,
  rcsInput: string,
  year: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: boolean; document?: LuxembourgDocument; documents?: LuxembourgDocument[]; error?: string }> {
  const rcs = normalizeRcs(rcsInput);
  if (!rcs) return { ok: false, error: "RCS lussemburghese non valido" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const documents = await discoveryPages(companyName.trim() || rcs, rcs, controller.signal);
    const document = documents.find((item) => item.year === year);
    if (!document) {
      return {
        ok: false,
        documents,
        error: documents.length
          ? `Comptes annuels ${year} non disponibile per ${rcs}`
          : `nessun permalink gd.lu trovato per ${rcs}`,
      };
    }
    return { ok: true, document, documents };
  } catch (error) {
    const err = error as { name?: string; message?: string } | undefined;
    return { ok: false, error: err?.name === "AbortError" ? "timeout" : (err?.message ?? "errore di rete") };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLuxembourgFinancials(
  rcsInput: string,
  companyName: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<LuxembourgResult> {
  const rcs = normalizeRcs(rcsInput);
  if (!rcs) return { ok: false, skipped: "serve il numero RCS lussemburghese (es. B60814)" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const documents = await discoveryPages(companyName.trim() || rcs, rcs, controller.signal);
    if (!documents.length) {
      return {
        ok: true,
        rcs,
        companyName: companyName.trim() || undefined,
        data: {
          available: false,
          years: [],
          source: "Luxembourg Business Registers / RCS",
          availability: "REGISTRY_ONLY",
          restriction: "SOURCE_UNAVAILABLE",
          documents: [],
          note: "Nessun permalink documentale individuato automaticamente. Il registro ufficiale resta disponibile per la consultazione manuale.",
        },
      };
    }

    const summaries = toInternalLuxembourgDocuments(rcs, documents);
    const primary = summaries[0];
    return {
      ok: true,
      rcs,
      companyName: companyName.trim() || undefined,
      data: {
        available: true,
        currency: "EUR",
        years: documents.map((doc) => ({
          periodLabel: `Esercizio ${doc.year}`,
          year: doc.year,
          currency: "EUR",
        })),
        source: "Luxembourg Business Registers — documenti ufficiali RCS/eCDF",
        availability: "DOCUMENT_DOWNLOADABLE",
        documents: summaries,
        documentUrl: primary?.downloadUrl,
        documentTitle: primary?.title,
        note: "I documenti sono individuati come permalink ufficiali gd.lu collegati ai depositi RCS; il download passa dall'endpoint documentale interno TPbox.",
      },
    };
  } catch (error) {
    const err = error as { name?: string; message?: string } | undefined;
    return {
      ok: false,
      error: err?.name === "AbortError" ? "timeout" : (err?.message ?? "errore di rete"),
    };
  } finally {
    clearTimeout(timer);
  }
}
