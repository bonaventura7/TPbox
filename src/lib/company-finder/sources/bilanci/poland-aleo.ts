const ALEO_ORIGIN = "https://aleo.com";
const JINA_ORIGIN = "https://r.jina.ai/http://";
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

function isPdf(bytes: Uint8Array, contentType: string): boolean {
  return contentType.includes("pdf") || new TextDecoder("latin1").decode(bytes.slice(0, 8)).startsWith("%PDF-");
}

function yearNear(text: string, index: number): number | undefined {
  const window = text.slice(Math.max(0, index - 300), Math.min(text.length, index + 300));
  const matches = [...window.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  return matches.sort((a, b) => b - a)[0];
}

function normalizeUrl(raw: string): string {
  const value = raw
    .trim()
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\u0026/g, "&")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/");
  return new URL(value.startsWith("//") ? `https:${value}` : value, ALEO_ORIGIN).toString();
}

function pushDocument(
  documents: AleoAnnualDocument[],
  seen: Set<string>,
  href: string,
  text: string,
  sourceText: string,
  requestedYear?: number,
  position = 0,
): void {
  let url: string;
  try {
    url = normalizeUrl(href);
  } catch {
    return;
  }
  if (url.startsWith("https://aleo.com/") && !/\.pdf(?:[?#]|$)/i.test(url)) return;
  const context = `${text} ${sourceText} ${url}`;
  if (!/pdf/i.test(context)) return;
  if (!/sprawozdanie|financial|bilans|annual/i.test(context)) return;
  const year = yearNear(sourceText, position);
  if (requestedYear && year && year !== requestedYear) return;
  if (seen.has(url)) return;
  seen.add(url);
  documents.push({
    id: url,
    ...(year === undefined ? {} : { year }),
    title: text || `Roczne sprawozdanie finansowe${year ? ` ${year}` : ""}`,
    format: "pdf",
    url,
  });
}

export function extractAleoAnnualDocuments(html: string, requestedYear?: number): AleoAnnualDocument[] {
  const documents: AleoAnnualDocument[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1] ?? "";
    const text = (match[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    pushDocument(documents, seen, href, text, html, requestedYear, match.index ?? 0);
  }

  const markdownPattern = /\[([^\]]*(?:pobierz|download|sprawozdanie)[^\]]*)\]\(([^)]+)\)/gi;
  for (const match of html.matchAll(markdownPattern)) {
    const text = (match[1] ?? "").trim();
    pushDocument(documents, seen, match[2] ?? "", text, html, requestedYear, match.index ?? 0);
  }

  for (const match of html.matchAll(/(?:https?:)?(?:\\\/\\\/|\/\/)[^\s"'<>]+\.pdf(?:\?[^\s"'<>]*)?/gi)) {
    pushDocument(documents, seen, match[0] ?? "", "Roczne sprawozdanie finansowe", html, requestedYear, match.index ?? 0);
  }

  return documents.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}

async function fetchReaderPage(companyName: string, signal: AbortSignal): Promise<{ text: string; url: string }> {
  const slug = slugify(companyName);
  if (!slug) throw new Error("denominazione polacca non valida");
  const aleoUrl = `${ALEO_ORIGIN}/pl/firma/${slug}`;
  const readerUrl = `${JINA_ORIGIN}${aleoUrl.replace(/^https?:\/\//, "")}`;
  const response = await fetch(readerUrl, {
    headers: {
      "User-Agent": UA,
      Accept: "text/plain,text/markdown,text/html,*/*",
      "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
    },
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ALEO reader HTTP ${response.status}`);
  return { text: await response.text(), url: aleoUrl };
}

async function fetchDirectPage(companyName: string, signal: AbortSignal): Promise<{ text: string; url: string }> {
  const slug = slugify(companyName);
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
  return { text: await response.text(), url };
}

async function fetchAleoPage(companyName: string, signal: AbortSignal): Promise<{ text: string; url: string }> {
  try {
    return await fetchReaderPage(companyName, signal);
  } catch {
    return fetchDirectPage(companyName, signal);
  }
}

async function fetchPdf(url: string, signal: AbortSignal): Promise<AleoDocumentResult> {
  let source: URL;
  try {
    source = new URL(url);
  } catch {
    return { ok: false, bytes: new Uint8Array(), contentType: "", error: "URL ALEO non valida" };
  }
  if (source.protocol !== "https:" || source.hostname !== "aleo.com") {
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
  return { ok: true, bytes, contentType: "application/pdf", filename: "bilancio.pdf" };
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
    const documents = extractAleoAnnualDocuments(page.text, requestedYear);
    return documents.length
      ? { ok: true, documents }
      : { ok: false, documents: [], error: requestedYear ? `bilancio ${requestedYear} non trovato su ALEO` : "nessun PDF di bilancio trovato su ALEO" };
  } catch (error) {
    const err = error as { name?: string; message?: string };
    return { ok: false, documents: [], error: err?.name === "AbortError" ? "timeout ALEO" : (err?.message ?? "errore ALEO") };
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
    const documents = extractAleoAnnualDocuments(page.text, year);
    const document = documents[0] ?? extractAleoAnnualDocuments(page.text)[0];
    if (!document) return { ok: false, bytes: new Uint8Array(), contentType: "", error: `bilancio ${year} non disponibile su ALEO` };
    const result = await fetchPdf(document.url, controller.signal);
    return { ...result, document };
  } catch (error) {
    const err = error as { name?: string; message?: string };
    return { ok: false, bytes: new Uint8Array(), contentType: "", error: err?.name === "AbortError" ? "timeout download ALEO" : (err?.message ?? "errore download ALEO") };
  } finally {
    clearTimeout(timer);
  }
}
