// ---------- Resolver interno dei documenti di bilancio ----------
// Endpoint interno: GET /api/company-finder/financial-document?token=<opaco>
//
// Il client riceve SOLO un token opaco: l'URL del registro, gli header e gli
// eventuali cookie restano lato server. Il resolver applica, in questo ordine:
//   1. risoluzione del token (TTL) — 404 se scaduto o inesistente
//   2. allowlist ESATTA di hostname + https obbligatorio (SSRF)
//   3. redirect manuali, validati hop per hop contro la stessa allowlist
//   4. timeout, retry max 3 con exponential backoff + jitter, circuit breaker
//   5. validazione status / content-type / magic bytes / dimensione
//   6. SHA-256 e provenienza, esposti come header di risposta
//
// Nessun controllo tecnico del registro viene aggirato: se la fonte richiede
// verifica anti-bot o autenticazione, l'adapter non emette alcun token.

import type { AcquiredDocument, AdapterResult, DocumentSourceRef, RestrictionCode } from "./registry/types";
import { restrictionMessage } from "./registry/types";

/** Allowlist esatta: hostname interi, nessun wildcard, nessun IP letterale. */
export const ALLOWED_DOCUMENT_HOSTS = new Set([
  // DE — Unternehmensregister / Bundesanzeiger
  "www.unternehmensregister.de",
  "unternehmensregister.de",
  "publikations-plattform.de",
  "www.publikations-plattform.de",
  "www.bundesanzeiger.de",
  "bundesanzeiger.de",
  // DK — Regnskaber / CVR
  "regnskaber.virk.dk",
  "datacvr.virk.dk",
  // NL — KVK open data
  "opendata.kvk.nl",
  // BE — NBB Central Balance Sheet Office
  "ws.cbso.nbb.be",
  "ws.uat2.cbso.nbb.be",
  // UK — Companies House, sito pubblico
  "find-and-update.company-information.service.gov.uk",
  // GR — G.E.MI. / BusinessPortal iXBRL filings
  "filings.businessportal.gr",
  "publicity.businessportal.gr",
]);

const MAX_BYTES = 30 * 1024 * 1024;
/** Soglia minima: scarta pagine di errore vuote senza escludere PDF minimi. */
const MIN_BYTES = 8;
const TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 250;
const MAX_REDIRECTS = 3;
const TOKEN_TTL_MS = 15 * 60 * 1000;
const BREAKER_THRESHOLD = 5;
const BREAKER_WINDOW_MS = 60_000;
const BREAKER_OPEN_MS = 120_000;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type DocumentFormatDetected = "pdf" | "zip" | "xml" | "html" | "unknown";

export class ResolverError extends Error {
  constructor(
    readonly restriction: RestrictionCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ResolverError";
  }
}

// ---------------------------------------------------------------- allowlist

function isIpLiteral(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith("[");
}

export function isAllowedSource(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (isIpLiteral(host)) return false;
  return ALLOWED_DOCUMENT_HOSTS.has(host);
}

// ------------------------------------------------------------ token opachi

interface TokenEntry {
  ref: DocumentSourceRef;
  expiresAt: number;
}

const tokens = new Map<string, TokenEntry>();
const tokensByRef = new Map<string, string>();

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Idempotenza: lo stesso riferimento riusa il token finché è valido. */
export function issueDocumentToken(ref: DocumentSourceRef): string {
  const key = `${ref.registry}|${ref.url}`;
  const existing = tokensByRef.get(key);
  if (existing) {
    const entry = tokens.get(existing);
    if (entry && entry.expiresAt > Date.now()) return existing;
  }
  const token = randomToken();
  tokens.set(token, { ref, expiresAt: Date.now() + TOKEN_TTL_MS });
  tokensByRef.set(key, token);
  return token;
}

export function resolveDocumentToken(token: string): DocumentSourceRef | undefined {
  const entry = tokens.get(token);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    tokens.delete(token);
    return undefined;
  }
  return entry.ref;
}

// -------------------------------------------------------- circuit breaker

interface BreakerState {
  failures: number[];
  openUntil: number;
}

const breakers = new Map<string, BreakerState>();

function breakerFor(host: string): BreakerState {
  const existing = breakers.get(host);
  if (existing) return existing;
  const fresh: BreakerState = { failures: [], openUntil: 0 };
  breakers.set(host, fresh);
  return fresh;
}

export function isBreakerOpen(host: string): boolean {
  return breakerFor(host).openUntil > Date.now();
}

function recordFailure(host: string): void {
  const state = breakerFor(host);
  const now = Date.now();
  state.failures = state.failures.filter((t) => now - t < BREAKER_WINDOW_MS);
  state.failures.push(now);
  if (state.failures.length >= BREAKER_THRESHOLD) {
    state.openUntil = now + BREAKER_OPEN_MS;
    state.failures = [];
  }
}

function recordSuccess(host: string): void {
  breakers.set(host, { failures: [], openUntil: 0 });
}

/** Usato dai test per isolare token e breaker tra i casi. */
export function resetResolverState(): void {
  tokens.clear();
  tokensByRef.clear();
  breakers.clear();
}

// ------------------------------------------------------------- validazione

export function detectFormat(bytes: Uint8Array): DocumentFormatDetected {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 64)).trimStart();
  if (head.startsWith("%PDF-")) return "pdf";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "zip";
  if (head.startsWith("<?xml")) return "xml";
  if (/^<(!doctype html|html)/i.test(head)) return "html";
  return "unknown";
}

export type Validation =
  | { ok: true; format: DocumentFormatDetected; contentType: string; size: number }
  | { ok: false; reason: string };

export function validateDocument(input: {
  status: number;
  contentType: string;
  bytes: ArrayBuffer;
}): Validation {
  if (input.status !== 200) return { ok: false, reason: `status ${input.status}` };
  const size = input.bytes.byteLength;
  if (size > MAX_BYTES) return { ok: false, reason: "documento troppo grande" };
  if (size < MIN_BYTES) return { ok: false, reason: "documento vuoto" };

  const contentType = (input.contentType || "").toLowerCase();
  const format = detectFormat(new Uint8Array(input.bytes));

  if (contentType.includes("pdf") && format !== "pdf") {
    return { ok: false, reason: "content-type pdf ma contenuto non pdf" };
  }
  if ((contentType.includes("xml") || contentType.includes("xhtml")) && format === "pdf") {
    return { ok: false, reason: "content-type xml ma contenuto pdf" };
  }
  if (format === "unknown" && !contentType.includes("octet-stream")) {
    return { ok: false, reason: "formato del documento non riconosciuto" };
  }
  return { ok: true, format, contentType: contentType || "application/octet-stream", size };
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newCorrelationId(): string {
  return `cf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------- fetching

export interface ResolverDeps {
  fetchImpl?: typeof fetch | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
}

function backoffDelay(attempt: number): number {
  const base = BASE_DELAY_MS * 2 ** (attempt - 1);
  const jitter = base * 0.4 * (Math.random() * 2 - 1);
  return Math.max(50, Math.round(base + jitter));
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

async function fetchOnce(
  url: URL,
  deps: ResolverDeps,
  accept: string,
): Promise<{ status: number; contentType: string; bytes: ArrayBuffer }> {
  const doFetch = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await doFetch(current.toString(), {
        method: "GET",
        headers: { "User-Agent": UA, Accept: accept },
        redirect: "manual",
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new ResolverError("SOURCE_UNAVAILABLE", 502, "redirect senza destinazione");
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          throw new ResolverError("SOURCE_RESTRICTION", 403, "destinazione del redirect non valida");
        }
        if (!isAllowedSource(next)) {
          throw new ResolverError("SOURCE_RESTRICTION", 403, "redirect verso un dominio non autorizzato");
        }
        current = next;
        continue;
      }
      if (RETRYABLE_STATUS.has(response.status)) {
        throw new ResolverError("SOURCE_UNAVAILABLE", 502, `fonte non disponibile (${response.status})`);
      }
      if (response.status !== 200) {
        throw new ResolverError("SOURCE_RESTRICTION", 502, `la fonte ha risposto ${response.status}`);
      }
      return {
        status: response.status,
        contentType: (response.headers.get("content-type") ?? "").toLowerCase(),
        bytes: await response.arrayBuffer(),
      };
    }
    throw new ResolverError("SOURCE_RESTRICTION", 502, "troppi redirect");
  } finally {
    clearTimeout(timer);
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof ResolverError) return error.restriction === "SOURCE_UNAVAILABLE" && error.status === 502;
  return true; // errore di rete o timeout
}

/** Scarica dalla fonte con timeout, retry idempotente e circuit breaker. */
export async function acquireFromSource(
  ref: DocumentSourceRef,
  options: { correlationId?: string | undefined } & ResolverDeps = {},
): Promise<AdapterResult<AcquiredDocument>> {
  const correlationId = options.correlationId ?? newCorrelationId();
  let source: URL;
  try {
    source = new URL(ref.url);
  } catch {
    return { ok: false, restriction: "SOURCE_RESTRICTION", message: "riferimento non valido", retryable: false };
  }
  if (!isAllowedSource(source)) {
    throw new ResolverError("SOURCE_RESTRICTION", 403, "dominio non autorizzato");
  }
  const host = source.hostname.toLowerCase();
  if (isBreakerOpen(host)) {
    throw new ResolverError("SOURCE_UNAVAILABLE", 503, "fonte temporaneamente sospesa (circuit breaker)");
  }

  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const fetched = await fetchOnce(source, options, ref.accept ?? "*/*");
      const validation = validateDocument(fetched);
      if (!validation.ok) {
        recordFailure(host);
        throw new ResolverError("INVALID_DOCUMENT", 502, validation.reason);
      }
      recordSuccess(host);
      return {
        ok: true,
        data: {
          bytes: fetched.bytes,
          contentType: validation.contentType,
          size: validation.size,
          sha256: await sha256Hex(fetched.bytes),
          provenance: { registry: ref.registry, fetchedAt: new Date().toISOString(), correlationId },
        },
      };
    } catch (error) {
      lastError = error;
      if (error instanceof ResolverError && error.status === 403) throw error;
      if (error instanceof ResolverError && error.restriction === "INVALID_DOCUMENT") throw error;
      recordFailure(host);
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS) break;
      await sleep(backoffDelay(attempt));
      if (isBreakerOpen(host)) break;
    }
  }

  if (lastError instanceof ResolverError) throw lastError;
  throw new ResolverError("SOURCE_UNAVAILABLE", 502, "fonte non raggiungibile");
}

// ------------------------------------------------------------- endpoint

function fail(restriction: RestrictionCode, status: number): Response {
  // Nessun URL, host, cookie o token della fonte nel corpo della risposta.
  return new Response(JSON.stringify({ error: restrictionMessage(restriction), restriction }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function handleFinancialDocumentRequest(
  request: Request,
  deps: ResolverDeps = {},
): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return fail("SOURCE_RESTRICTION", 400);

  const ref = resolveDocumentToken(token);
  if (!ref) return fail("SESSION_BOUND", 404);

  const correlationId = newCorrelationId();
  try {
    const outcome = await acquireFromSource(ref, { ...deps, correlationId });
    if (!outcome.ok) return fail(outcome.restriction, 502);
    const doc = outcome.data;
    return new Response(doc.bytes, {
      headers: {
        "Content-Type": doc.contentType,
        "Content-Disposition": "attachment",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Document-Sha256": doc.sha256,
        "X-Document-Registry": doc.provenance.registry,
        "X-Correlation-Id": correlationId,
      },
    });
  } catch (error) {
    if (error instanceof ResolverError) return fail(error.restriction, error.status);
    return fail("SOURCE_UNAVAILABLE", 502);
  }
}
