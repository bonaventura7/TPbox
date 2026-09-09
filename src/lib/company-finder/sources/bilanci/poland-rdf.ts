import { createCipheriv } from "node:crypto";

import { isRdfWafChallenge } from "./rdf-session";

const RDF_ORIGIN = "https://rdf-przegladarka.ms.gov.pl";
const SEARCH_PATH = "/services/rdf/przegladarka-dokumentow-finansowych/dokumenty/wyszukiwanie";
const CONTENT_PATH = "/services/rdf/przegladarka-dokumentow-finansowych/dokumenty";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const TIMEOUT_MS = 30_000;
const MAX_BYTES = 30 * 1024 * 1024;

export interface PolishAnnualDocument {
  id: string;
  year?: number;
  title: string;
  format: "pdf" | "xbrl" | "xml" | "zip" | "html" | "unknown";
}

export interface PolishAnnualSearchResult {
  ok: boolean;
  documents: PolishAnnualDocument[];
  error?: string;
}

export interface PolishFinancialDocument {
  ok: boolean;
  bytes: Uint8Array;
  contentType: string;
  filename?: string;
  error?: string;
}

interface CookieJar {
  values: Map<string, string>;
}

function createCookieJar(): CookieJar {
  return { values: new Map() };
}

function setCookies(jar: CookieJar, headers: Headers): void {
  const getter = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const values =
    typeof getter === "function"
      ? getter.call(headers)
      : (headers.get("set-cookie") ?? "")
        ? (headers.get("set-cookie") ?? "").split(/,(?=[^;=]+=)/)
        : [];

  for (const raw of values) {
    const first = raw.trim().split(";", 1)[0];
    if (!first) continue;
    const separator = first.indexOf("=");
    if (separator <= 0) continue;
    jar.values.set(first.slice(0, separator), first.slice(separator + 1));
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.values].map(([name, value]) => `${name}=${value}`).join("; ");
}

function normalizeKrs(value: string): string {
  return value.replace(/\D/g, "").padStart(10, "0");
}

function warsawParts(date: Date): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * The current RDF viewer encrypts KRS together with a Warsaw-local timestamp.
 * AES-128-CBC uses the hourly key as both key and IV; the key is padded with
 * the literal "1" to 16 bytes.
 */
export function encryptPolishKrs(krsNumber: string, now = new Date()): string {
  const krs = normalizeKrs(krsNumber);
  if (!/^\d{10}$/.test(krs)) throw new Error("KRS non valido");

  const parts = warsawParts(now);
  const hourly = `${parts.year}-${parts.month}-${parts.day}-${parts.hour}`;
  const keyText = `${hourly}${"1".repeat(Math.max(0, 16 - hourly.length))}`;
  const key = Buffer.from(keyText.slice(0, 16), "utf8");
  const plainText = `${krs}${hourly}-${parts.minute}-${parts.second}`;

  const cipher = createCipheriv("aes-128-cbc", key, key);
  return Buffer.concat([cipher.update(Buffer.from(plainText, "utf8")), cipher.final()]).toString("base64");
}

async function bootstrapSession(jar: CookieJar, signal: AbortSignal): Promise<string | undefined> {
  const paths = ["/wyszukaj-podmiot", "/"];
  let lastError: Error | undefined;

  for (const path of paths) {
    const response = await fetch(`${RDF_ORIGIN}${path}`, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
      },
      signal,
      cache: "no-store",
    });
    const body = await response.clone().text();
    setCookies(jar, response.headers);
    if (!response.ok) {
      lastError = new Error(`RDF session HTTP ${response.status}`);
      continue;
    }
    if (isRdfWafChallenge(body) && !jar.values.has("XSRF-TOKEN")) {
      lastError = new Error("RDF challenge: public viewer returned a WAF/Incapsula challenge");
      continue;
    }
    const xsrf = jar.values.get("XSRF-TOKEN");
    if (xsrf) return decodeURIComponent(xsrf);
  }

  throw lastError ?? new Error("RDF session non stabilita");
}

function requestHeaders(jar: CookieJar, xsrf?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
    Origin: RDF_ORIGIN,
    Referer: `${RDF_ORIGIN}/wyszukaj-podmiot`,
  };
  const cookies = cookieHeader(jar);
  if (cookies) headers["Cookie"] = cookies;
  if (xsrf) headers["X-XSRF-TOKEN"] = xsrf;
  return headers;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  const value = firstString(record, keys);
  if (!value) return undefined;
  const match = value.match(/\b(19|20)\d{2}\b/);
  if (!match) return undefined;
  const year = Number(match[0]);
  return year >= 1900 && year <= 2100 ? year : undefined;
}

function documentFormat(record: Record<string, unknown>): PolishAnnualDocument["format"] {
  const text = JSON.stringify(record).toLowerCase();
  if (text.includes("pdf")) return "pdf";
  if (text.includes("xhtml") || text.includes("xbrl")) return "xbrl";
  if (text.includes("xml")) return "xml";
  if (text.includes("zip")) return "zip";
  if (text.includes("html")) return "html";
  return "unknown";
}

function looksLikeAnnualReport(record: Record<string, unknown>): boolean {
  const text = JSON.stringify(record)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return text.includes("roczne sprawozdanie finansowe") || text.includes("sprawozdanie finansowe");
}

function collectDocumentRecords(value: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const item of value) collectDocumentRecords(item, out);
    return out;
  }
  const record = asObject(value);
  if (!record) return out;
  if (looksLikeAnnualReport(record)) out.push(record);
  for (const child of Object.values(record)) collectDocumentRecords(child, out);
  return out;
}

function documentId(record: Record<string, unknown>): string | undefined {
  return firstString(record, [
    "idDokumentu",
    "identyfikatorDokumentu",
    "documentId",
    "identyfikator",
    "id",
  ]);
}

function documentTitle(record: Record<string, unknown>): string {
  return (
    firstString(record, [
      "nazwaDokumentu",
      "rodzajDokumentu",
      "typDokumentu",
      "nazwa",
      "opis",
    ]) ?? "Roczne sprawozdanie finansowe"
  );
}

export function extractPolishAnnualDocuments(payload: unknown, requestedYear?: number): PolishAnnualDocument[] {
  const records = collectDocumentRecords(payload);
  const seen = new Set<string>();
  const documents: PolishAnnualDocument[] = [];

  for (const record of records) {
    const id = documentId(record);
    if (!id || seen.has(id)) continue;
    const year = firstNumber(record, [
      "rokObrotowy",
      "rok",
      "rokSprawozdawczy",
      "dataOkresuDo",
      "okresDo",
      "dataDo",
      "dataZlozenia",
    ]);
    if (requestedYear && year && year !== requestedYear) continue;
    documents.push({
      id,
      ...(year === undefined ? {} : { year }),
      title: documentTitle(record),
      format: documentFormat(record) === "unknown" ? "pdf" : documentFormat(record),
    });
    seen.add(id);
  }

  return documents.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}

async function fetchJsonWithSession(
  krs: string,
  jar: CookieJar,
  signal: AbortSignal,
): Promise<unknown> {
  let xsrf = await bootstrapSession(jar, signal);
  const encryptedKrs = encryptPolishKrs(krs);
  const request = () =>
    fetch(`${RDF_ORIGIN}${SEARCH_PATH}`, {
      method: "POST",
      headers: {
        ...requestHeaders(jar, xsrf),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        nrKRS: encryptedKrs,
        metadaneStronicowania: {
          numerStrony: 0,
          rozmiarStrony: 100,
          metadaneSortowania: [{ atrybut: "id", kierunek: "MALEJACO" }],
        },
      }),
      signal,
      cache: "no-store",
    });

  let response = await request();
  if (response.status === 401 || response.status === 403) {
    jar.values.clear();
    xsrf = await bootstrapSession(jar, signal);
    response = await request();
  }
  if (!response.ok) throw new Error(`RDF ricerca HTTP ${response.status}`);
  return response.json();
}

export async function searchPolishAnnualReports(
  krsNumber: string,
  requestedYear?: number,
  timeoutMs = TIMEOUT_MS,
): Promise<PolishAnnualSearchResult> {
  const krs = normalizeKrs(krsNumber);
  if (!/^\d{10}$/.test(krs)) return { ok: false, documents: [], error: "KRS non valido" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const payload = await fetchJsonWithSession(krs, createCookieJar(), controller.signal);
    const documents = extractPolishAnnualDocuments(payload, requestedYear);
    return documents.length
      ? { ok: true, documents }
      : { ok: false, documents: [], error: requestedYear ? `bilancio ${requestedYear} non trovato nel RDF KRS` : "nessun bilancio individuato nel RDF KRS" };
  } catch (error) {
    const err = error as { name?: string; message?: string };
    return {
      ok: false,
      documents: [],
      error: err?.name === "AbortError" ? "timeout RDF KRS" : (err?.message ?? "errore di rete RDF KRS"),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDocumentContent(
  krsNumber: string,
  documentIdValue: string,
  timeoutMs: number,
): Promise<PolishFinancialDocument> {
  const krs = normalizeKrs(krsNumber);
  if (!/^\d{10}$/.test(krs) || !documentIdValue.trim()) {
    return { ok: false, bytes: new Uint8Array(), contentType: "", error: "parametri documento non validi" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const jar = createCookieJar();
  try {
    const xsrf = await bootstrapSession(jar, controller.signal);
    const response = await fetch(
      `${RDF_ORIGIN}${CONTENT_PATH}/${encodeURIComponent(documentIdValue)}/tresc?bezPodpisu=false`,
      {
        headers: {
          ...requestHeaders(jar, xsrf),
          Accept: "application/pdf,application/octet-stream,application/xml,text/xml,text/html,*/*",
        },
        signal: controller.signal,
        cache: "no-store",
      },
    );
    setCookies(jar, response.headers);
    if (!response.ok) throw new Error(`RDF documento HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) throw new Error("documento troppo grande");
    const bytes = new Uint8Array(arrayBuffer);
    const contentType = (response.headers.get("content-type") ?? "application/octet-stream").toLowerCase();
    const isPdf = contentType.includes("pdf") || new TextDecoder("latin1").decode(bytes.slice(0, 8)).startsWith("%PDF-");
    if (!isPdf && !contentType.includes("xml") && !contentType.includes("html") && !contentType.includes("octet-stream")) {
      throw new Error("RDF ha restituito un formato non riconosciuto");
    }
    return {
      ok: true,
      bytes,
      contentType: isPdf ? "application/pdf" : contentType,
      filename: isPdf ? `bilancio-${krs}-${documentIdValue}.pdf` : `bilancio-${krs}-${documentIdValue}`,
    };
  } catch (error) {
    const err = error as { name?: string; message?: string };
    return {
      ok: false,
      bytes: new Uint8Array(),
      contentType: "",
      error: err?.name === "AbortError" ? "timeout download RDF KRS" : (err?.message ?? "errore download RDF KRS"),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPolishFinancialDocument(
  krsNumber: string,
  documentIdValue: string,
  timeoutMs = TIMEOUT_MS,
): Promise<PolishFinancialDocument> {
  return fetchDocumentContent(krsNumber, documentIdValue, timeoutMs);
}

export async function fetchPolishAnnualReport(
  krsNumber: string,
  year: number,
  timeoutMs = TIMEOUT_MS,
): Promise<PolishFinancialDocument & { document?: PolishAnnualDocument }> {
  const found = await searchPolishAnnualReports(krsNumber, year, timeoutMs);
  if (!found.ok || !found.documents[0]) {
    return {
      ok: false,
      bytes: new Uint8Array(),
      contentType: "",
      error: found.error ?? `bilancio ${year} non disponibile`,
    };
  }
  const document = found.documents[0];
  const result = await fetchDocumentContent(krsNumber, document.id, timeoutMs);
  return { ...result, document };
}
