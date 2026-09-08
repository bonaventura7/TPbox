const ALEO_ORIGIN = "https://aleo.com";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const MAX_BYTES = 30 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

export interface AleoAnnualDocument {
  id: string;
  year?: number;
  title: string;
  format: "pdf" | "xml" | "unknown";
  url: string;
}

export interface AleoSearchResult {
  ok: boolean;
  documents: AleoAnnualDocument[];
  error?: string;
}

export interface AleoDocumentResult {
  ok: boolean;
  bytes: Uint8Array;
  contentType: string;
  filename?: string;
  error?: string;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/đ/g, "d")
    .replace(/&/g, " i ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeKrs(value: string): string {
  return value.replace(/\D/g, "").padStart(10, "0");
}

function isPdf(bytes: Uint8Array, contentType: string): boolean {
  return contentType.includes("pdf") || new TextDecoder("latin1").decode(bytes.slice(0, 8)).startsWith("%PDF-");
}

function yearNear(text: string, index: number): number | undefined {
  const window = text.slice(Math.max(0, index - 250), Math.min(text.length, index + 250));
  const matches = [...window.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  return matches.sort((a, b) => b - a)[0];
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\u0026/g, "&")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/");
}

export function extractAleoAnnualDocuments(html: string, requestedYear?: number): AleoAnnualDocument[] {
  const documents: AleoAnnualDocument[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const rawHref = decodeHtml(match[1] ?? "");
    const rawText = (match[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const href = new URL(rawHref, ALEO_ORIGIN).toString();
    const context = `${rawText} ${href}`;
    if (!/\.pdf(?:[?#]|$)/i.test(href) && !/(?:download|pobierz|sprawozdanie)/i.test(context)) continue;
    if (!/pdf/i.test(context)) continue;
    if (!/sprawozdanie|financial|bilans|annual/i.test(context)) continue;
    const year = yearNear(html, match.index ?? 0);
    if (requestedYear && year && year !== requestedYear) continue;
    const id = href;
    if (seen.has(id)) continue;
    documents.push({
      id,
      year,
      title: rawText || `Roczne sprawozdanie finansowe${year ? ` ${year}` : ""}`,
      format: "pdf",
      url: href,
    });
    seen.add(id);
  }

  // Some ALEO pages render download URLs as escaped JSON rather than literal hrefs.
  for (const match of html.matchAll(/(?:https?:)?(?:\\\/\\\/|\/\/)[^\s"'<>]+\.pdf(?:\?[^\s"'<>]*)?/gi)) {
    const href = decodeHtml(match[0]);
    const absolute = href.startsWith("//") ? `https:${href}` : href.startsWith("http") ? href : `${ALEO_ORIGIN}${href}`;
    if (seen.has(absolute)) continue;
    const year = yearNear(html, match.index ?? 0);
    if (requestedYear && year && year !== requestedYear) continue;
    documents.push({
      id: absolute,
      year,
      title: `Roczne sprawozdanie finansowe${year ? ` ${year}` : ""}`,
      format: "pdf",
      url: absolute,
    });
    seen.add(absolute);
  }

  return documents.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}

async function fetchAleoPage(companyName: string, signal: AbortSignal): Promise<{ html: string; url: string }> {
  const slug = slugify(companyName);
  if (!slug) throw new Error("denominazione polacca non valida");
  const url = `${ALEO_ORIGIN}/pl/firma/${slug}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
    },
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ALEO HTTP ${response.status}`);
  return { html: await response.text(), url };
}

async function fetchPdf(url: string, signal: AbortSignal): Promise<AleoDocumentResult> {
  let source: URL;
  try {
    source = new URL(url);
  } catch {
    return { ok: false, bytes: new Uint8Array(), contentType: "", error: "URL ALEO non valida" };
  }
  if (source.hostname !== "aleo.com" || source.protocol !== "https:") {
    return { ok: false, bytes: new Uint8Array(), contentType: "", error: "dominio documento ALEO non autorizzato" };
  }
  const response = await fetch(source.toString(), {
    headers: {
      "User-Agent": UA,
      Accept: "application/pdf,application/octet-stream,*/*",
      Referer: `${ALEO_ORIGIN}/`,
    },
    signal,
    redirect: "follow",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ALEO PDF HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error("PDF ALEO troppo grande");
  const contentType = (response.headers.get("content-type") ?? "application/octet-stream").toLowerCase();
  if (!isPdf(bytes, contentType)) throw new Error("ALEO non ha restituito un PDF");
  return {
    ok: true,
    bytes,
    contentType: "application/pdf",
    filename: "bilancio.pdf",
  };
}

export async function searchAleoAnnualReports(
  companyName: string,
  requestedYear?: number,
  timeoutMs = TIMEOUT_MS,
): Promise<AleoSearchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const page = await fetchAleoPage(companyName, controller.signal);
    const documents = extractAleoAnnualDocuments(page.html, requestedYear);
    return documents.length
      ? { ok: true, documents }
      : { ok: false, documents: [], error: requestedYear ? `bilancio ${requestedYear} non trovato su ALEO` : "nessun PDF di bilancio trovato su ALEO" };
  } catch (error) {
    const err = error as { name?: string; message?: string };
    return {
      ok: false,
      documents: [],
      error: err?.name === "AbortError" ? "timeout ALEO" : (err?.message ?? "errore ALEO"),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAleoAnnualReport(
  companyName: string,
  year: number,
  timeoutMs = TIMEOUT_MS,
): Promise<AleoDocumentResult & { document?: AleoAnnualDocument }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const page = await fetchAleoPage(companyName, controller.signal);
    const documents = extractAleoAnnualDocuments(page.html, year);
    const document = documents[0] ?? extractAleoAnnualDocuments(page.html)[0];
    if (!document) return { ok: false, bytes: new Uint8Array(), contentType: "", error: `bilancio ${year} non disponibile su ALEO` };
    const result = await fetchPdf(document.url, controller.signal);
    return { ...result, document };
  } catch (error) {
    const err = error as { name?: string; message?: string };
    return {
      ok: false,
      bytes: new Uint8Array(),
      contentType: "",
      error: err?.name === "AbortError" ? "timeout download ALEO" : (err?.message ?? "errore download ALEO"),
    };
  } finally {
    clearTimeout(timer);
  }
}
