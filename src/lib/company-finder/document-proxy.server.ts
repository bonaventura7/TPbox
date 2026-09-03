/**
 * Proxy in pagina per i documenti ufficiali di bilancio — nessun
 * reindirizzamento verso siti esterni.
 *
 * L'iframe della scheda punta QUI (stessa origine): il server scarica il
 * documento dal registro ufficiale (whitelist stretta di host) e lo serve.
 *  - PDF  → streaming diretto (il browser lo apre nel visore interno)
 *  - HTML → si tenta l'estrazione del PDF collegato (sempre su host
 *           autorizzato); se non c'è, si serve l'HTML ufficiale nell'iframe
 *
 * GET /api/company-finder/document?url=<url ufficiale>&accept=<mime opzionale>
 */
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
  // UK — Companies House, sito pubblico (conti annuali depositati)
  "find-and-update.company-information.service.gov.uk",
  // GR — G.E.MI. / BusinessPortal iXBRL filings
  "filings.businessportal.gr",
  "publicity.businessportal.gr",
]);

const HTTP_ONLY_HOSTS = new Set(["regnskaber.virk.dk"]);

const MAX_BYTES = 30 * 1024 * 1024;
const TIMEOUT_MS = 45_000;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

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
}

async function fetchRaw(target: string, signal: AbortSignal, accept: string): Promise<Fetched> {
  const res = await fetch(target, {
    headers: { "User-Agent": UA, Accept: accept },
    signal,
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`fonte HTTP ${res.status}`);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) throw new Error("documento troppo grande");
  return { bytes, contentType: (res.headers.get("content-type") ?? "").toLowerCase() };
}

function serve(doc: Fetched): Response {
  const isPdf = doc.contentType.includes("pdf");
  return new Response(doc.bytes, {
    headers: {
      "Content-Type": isPdf ? "application/pdf" : doc.contentType || "application/octet-stream",
      "Content-Disposition": "inline",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function handleDocumentRequest(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const target = params.get("url");
  const accept = params.get("accept") || "*/*";

  if (!target) return fail("url mancante", 400);

  let source: URL;
  try {
    source = new URL(target);
  } catch {
    return fail("url non valida", 400);
  }
  const plainHttpAllowed = HTTP_ONLY_HOSTS.has(source.hostname.toLowerCase());
  if (source.protocol !== "https:" && !(source.protocol === "http:" && plainHttpAllowed)) {
    return fail("sono ammesse solo url https", 400);
  }
  if (!isAllowedDocumentHost(source)) return fail("dominio non autorizzato", 403);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const first = await fetchRaw(source.toString(), controller.signal, accept);

    if (first.contentType.includes("html")) {
      const html = new TextDecoder("utf-8").decode(first.bytes);
      const links = Array.from(html.matchAll(/(?:href|src)="([^"]+?\.(?:pdf|xml)[^"]*)"/gi))
        .map((match) => match[1])
        .filter((link): link is string => Boolean(link));
      for (const link of links) {
        try {
          const absolute = new URL(link, source);
          if (!isAllowedDocumentHost(absolute)) continue;
          const doc = await fetchRaw(absolute.toString(), controller.signal, "*/*");
          if (doc.contentType.includes("pdf")) return serve(doc);
        } catch {
          // link non utilizzabile: si prova il successivo
        }
      }
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    return serve(first);
  } catch (error) {
    const err = error as { name?: string; message?: string };
    const reason =
      err?.name === "AbortError" ? "timeout della fonte" : (err?.message ?? "errore di rete");
    return fail(`impossibile recuperare il documento: ${reason}`, 502);
  } finally {
    clearTimeout(timer);
  }
}
