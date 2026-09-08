export const ALLOWED_DOCUMENT_HOSTS = new Set([
  "www.unternehmensregister.de",
  "unternehmensregister.de",
  "publikations-plattform.de",
  "www.publikations-plattform.de",
  "www.bundesanzeiger.de",
  "bundesanzeiger.de",
  "regnskaber.virk.dk",
  "datacvr.virk.dk",
  "opendata.kvk.nl",
  "ws.cbso.nbb.be",
  "ws.uat2.cbso.nbb.be",
  "find-and-update.company-information.service.gov.uk",
  "filings.businessportal.gr",
  "publicity.businessportal.gr",
  "www.pappers.fr",
  "pappers.fr",
  // EE — e-Äriregister (RIK): schede e bilanci pubblici
  "ariregister.rik.ee",
]);
const HTTP_ONLY_HOSTS = new Set(["regnskaber.virk.dk"]);

/** Host del gateway NBB CBSO (Belgio): ogni chiamata richiede la chiave. */
const CBSO_HOSTS = new Set(["ws.cbso.nbb.be", "ws.uat2.cbso.nbb.be"]);

/** Chiave NBB-CBSO, solo lato server. Lettura difensiva (runtime edge). */
function cbsoApiKey(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const key = env?.["NBB_CBSO_API_KEY"]?.trim();
  return key ? key : undefined;
}
const MAX_BYTES = 30 * 1024 * 1024;
const TIMEOUT_MS = 45_000;
const MAX_REDIRECTS = 4;
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

function fail(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function isAllowedDocumentHost(url: URL): boolean {
  return ALLOWED_DOCUMENT_HOSTS.has(url.hostname.toLowerCase());
}

interface Fetched {
  bytes: ArrayBuffer;
  contentType: string;
  finalUrl: URL;
}

interface CookieJar {
  values: Map<string, string>;
}
function jar(): CookieJar {
  return { values: new Map() };
}
function setCookies(j: CookieJar, headers: Headers): void {
  const getter = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const values =
    typeof getter === "function"
      ? getter.call(headers)
      : (headers.get("set-cookie") ?? "")
        ? (headers.get("set-cookie") ?? "").split(/,(?=[^;=]+=)/)
        : [];
  for (const raw of values) {
    const first = raw.trim().split(";", 1)[0];
    const eq = first.indexOf("=");
    if (eq > 0) j.values.set(first.slice(0, eq), first.slice(eq + 1));
  }
}
function cookieHeader(j: CookieJar): string {
  return [...j.values].map(([key, value]) => `${key}=${value}`).join("; ");
}
function isPdf(bytes: ArrayBuffer): boolean {
  return new TextDecoder("latin1").decode(new Uint8Array(bytes).slice(0, 8)).startsWith("%PDF-");
}
function isHtml(contentType: string, bytes: ArrayBuffer): boolean {
  if (contentType.includes("html") || contentType.includes("xhtml")) return true;
  const head = new TextDecoder("utf-8").decode(new Uint8Array(bytes).slice(0, 256)).trimStart();
  return /^<!doctype html|^<html[\s>]/i.test(head);
}
function allowed(value: string, base: URL): URL | undefined {
  try {
    const url = new URL(value, base);
    const httpOnly = HTTP_ONLY_HOSTS.has(url.hostname.toLowerCase());
    if (!isAllowedDocumentHost(url)) return;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && httpOnly)) return;
    return url;
  } catch {
    return;
  }
}
function linksFrom(text: string): string[] {
  const out = new Set<string>();
  const attr = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  for (const match of text.matchAll(attr)) {
    const value = (match[1] ?? "")
      .replace(/\\u0026/g, "&")
      .replace(/\\u003d/g, "=")
      .replace(/\\\//g, "/");
    if (/\.pdf(?:[?#]|$)/i.test(value) || /(?:pdf|document|download|file)/i.test(value))
      out.add(value);
  }
  for (const match of text.matchAll(/https?:\\?\/\\?\/[^\s"'<>\\\\]+/gi)) {
    const value = match[0].replace(/\\\//g, "/");
    if (/\.pdf(?:[?#]|$)/i.test(value) || /(?:pdf|document|download|file)/i.test(value))
      out.add(value);
  }
  return [...out];
}
async function fetchRaw(
  target: URL,
  signal: AbortSignal,
  accept: string,
  cookies: CookieJar,
  ref?: URL,
): Promise<Fetched> {
  let current = target;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const headers: Record<string, string> = {
      "User-Agent": UA,
      Accept: accept,
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    };
    // BE — NBB CBSO: il gateway pretende la chiave di sottoscrizione su ogni
    // chiamata, PDF incluso. La chiave resta solo qui, lato server: non
    // transita mai nell'URL né nella risposta al browser.
    if (CBSO_HOSTS.has(current.hostname.toLowerCase())) {
      const key = cbsoApiKey();
      if (!key) throw new Error("chiave NBB-CBSO non configurata sul server (NBB_CBSO_API_KEY)");
      headers["NBB-CBSO-Subscription-Key"] = key;
      headers["X-Request-Id"] =
        `tpbox-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
    const cookie = cookieHeader(cookies);
    if (cookie) headers.Cookie = cookie;
    if (ref) headers.Referer = ref.toString();
    const response = await fetch(current.toString(), {
      headers,
      signal,
      redirect: "manual",
      cache: "no-store",
    });
    setCookies(cookies, response.headers);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("redirect senza destinazione");
      const next = allowed(location, current);
      if (!next) throw new Error("redirect verso dominio non autorizzato");
      ref = current;
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`fonte HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) throw new Error("documento troppo grande");
    return {
      bytes,
      contentType: (response.headers.get("content-type") ?? "").toLowerCase(),
      finalUrl: current,
    };
  }
  throw new Error("troppi redirect");
}
async function bootstrap(cookies: CookieJar, signal: AbortSignal): Promise<void> {
  try {
    await fetchRaw(
      new URL("https://www.unternehmensregister.de/de/suche"),
      signal,
      "text/html,application/xhtml+xml",
      cookies,
    );
  } catch {}
}
function serve(doc: Fetched, download: boolean): Response {
  const pdf = isPdf(doc.bytes) || doc.contentType.includes("pdf");
  return new Response(doc.bytes, {
    headers: {
      "Content-Type": pdf ? "application/pdf" : doc.contentType || "text/html; charset=utf-8",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${pdf ? "bilancio.pdf" : "bilancio.html"}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
function unwrap(
  requestUrl: string,
  target: string,
  accept: string,
): { target: string; accept: string } {
  let current = target;
  let nextAccept = accept;
  for (let i = 0; i < 3; i++) {
    if (!current.startsWith("/api/company-finder/document?")) break;
    const url = new URL(current, requestUrl);
    const nested = url.searchParams.get("url");
    if (!nested) break;
    current = nested;
    nextAccept = url.searchParams.get("accept") || nextAccept;
  }
  return { target: current, accept: nextAccept };
}
export async function handleDocumentRequest(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const raw = params.get("url");
  if (!raw) return fail("url mancante", 400);
  const unwrapped = unwrap(request.url, raw, params.get("accept") || "*/*");
  let source: URL;
  try {
    source = new URL(unwrapped.target);
  } catch {
    return fail("url non valida", 400);
  }
  const httpOnly = HTTP_ONLY_HOSTS.has(source.hostname.toLowerCase());
  if (source.protocol !== "https:" && !(source.protocol === "http:" && httpOnly))
    return fail("sono ammesse solo url https", 400);
  if (!isAllowedDocumentHost(source)) return fail("dominio non autorizzato", 403);
  // BE — errore azionabile prima ancora di chiamare il gateway NBB, invece di
  // un 401 criptico dal CBSO.
  if (CBSO_HOSTS.has(source.hostname.toLowerCase()) && !cbsoApiKey()) {
    return fail(
      "conti annuali belgi non configurati: serve la chiave gratuita NBB-CBSO (NBB_CBSO_API_KEY)",
      503,
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const cookies = jar();
  try {
    if (source.hostname.endsWith("unternehmensregister.de"))
      await bootstrap(cookies, controller.signal);
    const first = await fetchRaw(source, controller.signal, unwrapped.accept, cookies);
    const download = params.get("download") === "1";
    if (!isHtml(first.contentType, first.bytes)) {
      if (isPdf(first.bytes) || /pdf|octet-stream|zip|xml/i.test(first.contentType))
        return serve(first, download);
      return fail("fonte non riconosciuta come documento scaricabile", 502);
    }
    const text = new TextDecoder("utf-8").decode(first.bytes);
    for (const link of linksFrom(text)) {
      const next = allowed(link, first.finalUrl);
      if (!next) continue;
      try {
        const document = await fetchRaw(
          next,
          controller.signal,
          "application/pdf,application/octet-stream,*/*",
          cookies,
          first.finalUrl,
        );
        if (isPdf(document.bytes) || document.contentType.includes("pdf"))
          return serve(document, download);
      } catch {}
    }
    return serve(first, download);
  } catch (error) {
    const err = error as { name?: string; message?: string };
    return fail(
      `impossibile recuperare il documento: ${err?.name === "AbortError" ? "timeout" : (err?.message ?? "errore di rete")}`,
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}
