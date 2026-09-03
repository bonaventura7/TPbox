/**
 * URL in-pagina dei documenti ufficiali.
 *
 * Il browser dell'utente non contatta MAI il registro: parla solo con
 * `/api/company-finder/document`, che è stessa origine. Il server scarica il
 * file e lo serve. Due modalità:
 *   inline     → il documento si apre nel riquadro della scheda
 *   attachment → il documento si scarica con un clic
 */

const PROXY_PATH = "/api/company-finder/document";

export type DocumentDisposition = "inline" | "attachment";

/**
 * Nome file sicuro per un header HTTP: niente a capo, niente virgolette,
 * ASCII dove possibile (i nomi dei registri sono spesso in greco).
 */
export function safeFileName(value: string | undefined, fallback = "documento-ufficiale"): string {
  const cleaned = (value ?? "")
    .replace(/[\r\n"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  const ascii = cleaned
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[\\/:*?<>|]+/g, "-")
    .trim();
  return ascii.length >= 4 ? ascii : fallback;
}

export function documentProxyUrl(
  sourceUrl: string,
  options: { disposition?: DocumentDisposition | undefined; fileName?: string | undefined } = {},
): string {
  const params = new URLSearchParams({ url: sourceUrl });
  const disposition = options.disposition ?? "inline";
  params.set("disposition", disposition);
  if (disposition === "attachment") params.set("filename", safeFileName(options.fileName));
  return `${PROXY_PATH}?${params.toString()}`;
}

export function documentViewerUrl(sourceUrl: string): string {
  return documentProxyUrl(sourceUrl, { disposition: "inline" });
}

export function documentDownloadUrl(sourceUrl: string, fileName?: string): string {
  return documentProxyUrl(sourceUrl, { disposition: "attachment", fileName });
}

/**
 * Formati che un browser sa mostrare dentro un <iframe>.
 *
 * Conta davvero: il registro ΓΕΜΗ pubblica alcuni bilanci come file `.xls`
 * (in realtà tabelle HTML con estensione Excel), che in un iframe produrrebbero
 * una schermata illeggibile. Per quelli la scheda mostra solo il download.
 */
const VIEWABLE_FORMATS = new Set(["PDF", "iXBRL", "XBRL", "HTML", "XML"]);

export function isViewableInPage(format: string | undefined): boolean {
  return Boolean(format && VIEWABLE_FORMATS.has(format));
}

/** Formato dichiarato all'utente, dedotto dal nome o dall'URL del documento. */
export function documentFormat(...hints: (string | undefined)[]): string | undefined {
  const haystack = hints.filter(Boolean).join(" ").toLowerCase();
  if (!haystack.trim()) return undefined;
  if (haystack.includes(".pdf") || haystack.includes("application/pdf")) return "PDF";
  if (haystack.includes(".xlsx")) return "XLSX";
  if (haystack.includes(".xls")) return "XLS";
  if (haystack.includes("ixbrlview") || haystack.includes(".xhtml")) return "iXBRL";
  if (haystack.includes(".xml")) return "XBRL";
  if (haystack.includes(".zip")) return "ZIP";
  return undefined;
}
