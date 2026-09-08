import type {
  DocumentAvailability,
  FinancialDocumentSummary,
  Financials,
  RestrictionCode,
} from "../../types";

const PAPPERS_BASE = "https://www.pappers.fr";
const PAPPERS_READER = "https://r.jina.ai/http://";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20_000;

export interface PappersPublicDocument {
  url: string;
  title: string;
  year: number;
}

export interface PappersPublicResult {
  ok: boolean;
  documents?: PappersPublicDocument[];
  error?: string;
  restriction?: RestrictionCode;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function yearFrom(value: string): number | undefined {
  const match = value.match(/(?:^|[^0-9])(20\d{2})(?:[^0-9]|$)/);
  return match ? Number(match[1]) : undefined;
}

function cleanText(value: string): string {
  return decodeHtml(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPappersPdf(value: string): boolean {
  try {
    const url = new URL(value, PAPPERS_BASE);
    return (
      url.hostname.toLowerCase() === "www.pappers.fr" &&
      /\/comptes\//i.test(url.pathname) &&
      /\.pdf$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function extractPdfLinks(html: string, pageUrl: URL): PappersPublicDocument[] {
  const candidates: PappersPublicDocument[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const attrsBefore = match[1] ?? "";
    const href = decodeHtml(match[2] ?? "");
    const attrsAfter = match[3] ?? "";
    const body = match[4] ?? "";
    const context = `${href} ${attrsBefore} ${attrsAfter} ${body}`;
    if (!isPappersPdf(new URL(href, pageUrl).toString())) continue;

    const absolute = new URL(href, pageUrl);
    const url = absolute.toString();
    if (seen.has(url)) continue;

    const year = yearFrom(context);
    if (!year) continue;
    seen.add(url);
    const title = cleanText(body) || `Comptes sociaux ${year}`;
    candidates.push({ url, title, year });
  }

  return candidates.sort((a, b) => b.year - a.year || a.title.localeCompare(b.title, "fr"));
}

function extractMarkdownPdfLinks(markdown: string): PappersPublicDocument[] {
  const candidates: PappersPublicDocument[] = [];
  const seen = new Set<string>();
  const pattern = /\[([^\]]+)\]\((https?:\/\/www\.pappers\.fr\/[^)]+\.pdf(?:\?[^)]*)?)\)/gi;

  for (const match of markdown.matchAll(pattern)) {
    const title = (match[1] ?? "").trim();
    const url = match[2] ?? "";
    if (!isPappersPdf(url) || seen.has(url)) continue;
    const year = yearFrom(`${title} ${url}`);
    if (!year) continue;
    seen.add(url);
    candidates.push({ url, title: title || `Comptes sociaux ${year}`, year });
  }

  return candidates.sort((a, b) => b.year - a.year || a.title.localeCompare(b.title, "fr"));
}

function pappersCompanyUrl(companyName: string, siren: string): URL {
  return new URL(`/entreprise/${slugify(companyName)}-${siren}`, PAPPERS_BASE);
}

async function fetchPageDirect(
  pageUrl: URL,
  signal: AbortSignal,
): Promise<{ html: string; finalUrl: URL; status: number }> {
  const response = await fetch(pageUrl, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    },
    signal,
    redirect: "follow",
    cache: "no-store",
  });
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_HTML_BYTES) throw new Error("pagina Pappers troppo grande");
  return {
    html: new TextDecoder("utf-8").decode(bytes),
    finalUrl: new URL(response.url || pageUrl.toString()),
    status: response.status,
  };
}

async function fetchPageViaReader(
  pageUrl: URL,
  signal: AbortSignal,
): Promise<{ markdown: string }> {
  const readerUrl = `${PAPPERS_READER}${pageUrl.toString().replace(/^https?:\/\//i, "")}`;
  const response = await fetch(readerUrl, {
    headers: {
      Accept: "text/plain,text/markdown,text/html;q=0.9,*/*;q=0.8",
      "User-Agent": "TPbox-CompanyFinder/1.0",
    },
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Pappers reader HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_HTML_BYTES) throw new Error("reader Pappers troppo grande");
  return { markdown: new TextDecoder("utf-8").decode(bytes) };
}

export async function findPappersAnnualReports(
  companyName: string,
  siren: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<PappersPublicResult> {
  const name = companyName.trim();
  const cleanSiren = siren.replace(/\D/g, "");
  if (!name) return { ok: false, error: "Pappers: ragione sociale mancante" };
  if (!/^\d{9}$/.test(cleanSiren)) return { ok: false, error: "Pappers: SIREN non valido" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const pageUrl = pappersCompanyUrl(name, cleanSiren);
  try {
    let direct: { html: string; finalUrl: URL; status: number } | undefined;
    try {
      direct = await fetchPageDirect(pageUrl, controller.signal);
    } catch (error) {
      const err = error as { name?: string; message?: string } | undefined;
      if (err?.name === "AbortError") throw error;
      direct = undefined;
    }

    if (direct?.status === 200) {
      if (/Ce document n'est pas disponible pour le moment/i.test(direct.html)) {
        return {
          ok: false,
          restriction: "SOURCE_UNAVAILABLE",
          error: "Pappers: il documento non è disponibile al momento",
        };
      }
      const documents = extractPdfLinks(direct.html, direct.finalUrl);
      if (documents.length) return { ok: true, documents };
    }

    // Pappers può bloccare gli IP server-side con HTTP 403. In questo solo caso
    // usiamo un reader HTTP pubblico per ottenere la stessa pagina pubblica e
    // recuperare i link PDF, senza autenticazione o token Pappers.
    if (direct?.status === 403 || !direct) {
      const reader = await fetchPageViaReader(pageUrl, controller.signal);
      const documents = extractMarkdownPdfLinks(reader.markdown);
      if (documents.length) return { ok: true, documents };
    }

    return {
      ok: false,
      restriction: "SOURCE_UNAVAILABLE",
      error: "Pappers: nessun compte social in formato PDF disponibile sulla pagina pubblica",
    };
  } catch (error) {
    const err = error as { name?: string; message?: string } | undefined;
    return {
      ok: false,
      error:
        err?.name === "AbortError"
          ? "Pappers: timeout"
          : `Pappers: ${err?.message ?? "errore di rete"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function findPappersAnnualReport(
  companyName: string,
  siren: string,
  year: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<PappersPublicResult & { document?: PappersPublicDocument }> {
  const result = await findPappersAnnualReports(companyName, siren, timeoutMs);
  if (!result.ok || !result.documents) return result;
  const document = result.documents.find((item) => item.year === year);
  if (!document) {
    return {
      ok: false,
      documents: result.documents,
      error: `Pappers: comptes sociaux ${year} non disponibile`,
      restriction: "SOURCE_UNAVAILABLE",
    };
  }
  return { ok: true, documents: result.documents, document };
}

export function toInternalPappersDocuments(
  companyName: string,
  siren: string,
  documents: PappersPublicDocument[],
): FinancialDocumentSummary[] {
  return documents.map((document) => {
    const downloadUrl = `/api/company-finder/document?country=FR&company=${encodeURIComponent(companyName)}&siren=${encodeURIComponent(siren)}&year=${document.year}`;
    return {
      id: `fr-${siren}-${document.year}`,
      year: document.year,
      kind: "ANNUAL_REPORT" as const,
      format: "pdf" as const,
      availability: "DOCUMENT_DOWNLOADABLE" as DocumentAvailability,
      title: document.title,
      downloadUrl,
    };
  });
}

export function withPappersDocuments(
  base: Financials,
  companyName: string,
  siren: string,
  documents: PappersPublicDocument[],
): Financials {
  if (documents.length === 0) return base;
  const summaries = toInternalPappersDocuments(companyName, siren, documents);
  const primary = summaries[0];
  return {
    ...base,
    availability: "DOCUMENT_DOWNLOADABLE",
    documents: summaries,
    documentUrl: primary?.downloadUrl,
    documentTitle: primary?.title,
    note: base.note ?? "Bilanci annuali scaricabili tramite l'endpoint documentale interno di TPbox.",
  };
}
