import type { DocumentAvailability, FinancialDocumentSummary, RestrictionCode } from "../../types";

const PAPPERS_BASE = "https://www.pappers.fr";
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
    if (!/\/comptes\//i.test(href)) continue;
    if (!/\.pdf(?:[?#]|$)/i.test(href)) continue;

    const absolute = new URL(href, pageUrl);
    if (absolute.hostname.toLowerCase() !== "www.pappers.fr") continue;
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

function pappersCompanyUrl(companyName: string, siren: string): URL {
  return new URL(`/entreprise/${slugify(companyName)}-${siren}`, PAPPERS_BASE);
}

async function fetchPage(
  pageUrl: URL,
  signal: AbortSignal,
): Promise<{ html: string; finalUrl: URL }> {
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
  if (!response.ok) throw new Error(`Pappers HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_HTML_BYTES) throw new Error("pagina Pappers troppo grande");
  return {
    html: new TextDecoder("utf-8").decode(bytes),
    finalUrl: new URL(response.url || pageUrl.toString()),
  };
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
  try {
    const { html, finalUrl } = await fetchPage(
      pappersCompanyUrl(name, cleanSiren),
      controller.signal,
    );
    if (/Ce document n'est pas disponible pour le moment/i.test(html)) {
      return {
        ok: false,
        restriction: "SOURCE_UNAVAILABLE",
        error: "Pappers: il documento non è disponibile al momento",
      };
    }

    const documents = extractPdfLinks(html, finalUrl);
    if (!documents.length) {
      return {
        ok: false,
        restriction: "SOURCE_UNAVAILABLE",
        error: "Pappers: nessun compte social in formato PDF disponibile sulla pagina pubblica",
      };
    }
    return { ok: true, documents };
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
