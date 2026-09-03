import { greekDownloadUrl, isGreekDocumentUrl } from "./greece";

const GREEK_FILING_RE =
  /https?:\/\/filings\.businessportal\.gr\/ixbrl\/[^\s"'<>]+?_ixbrlview\.html/gi;

/**
 * Link diretti ai documenti del registro greco.
 * Forma verificata sul portale: /api/download/<tipo>/<idDocumento>?companyId=<ΓΕΜΗ>
 * (tipo osservato: "financial" per i bilanci, "Modifications" per gli atti).
 */
const GREEK_DOWNLOAD_RE =
  /(?:https?:\/\/publicity\.businessportal\.gr)?\/api\/download\/[A-Za-z][A-Za-z0-9_-]*\/\d+\?companyId=\d+/gi;

/** Extract the first direct G.E.MI. iXBRL filing link exposed by the company page. */
export function extractGreekFilingUrl(html: string): string | undefined {
  const match = html.match(GREEK_FILING_RE)?.[0];
  if (!match) return undefined;
  return match.replace(/&amp;/g, "&");
}

/**
 * Tutti i link a documenti ufficiali presenti in un testo (HTML della scheda
 * società, JSON serializzato, pagina di servizio). Deduplicati e validati:
 * esce solo ciò che punta davvero a un documento del registro.
 */
export function extractGreekDocumentLinks(text: string): string[] {
  const found = new Set<string>();
  const haystack = text.replace(/&amp;/g, "&").replace(/\\\//g, "/");

  for (const match of haystack.match(GREEK_DOWNLOAD_RE) ?? []) {
    const absolute = match.startsWith("http")
      ? match
      : `https://publicity.businessportal.gr${match}`;
    if (isGreekDocumentUrl(absolute)) found.add(absolute);
  }
  for (const match of haystack.match(GREEK_FILING_RE) ?? []) {
    if (isGreekDocumentUrl(match)) found.add(match);
  }
  return [...found];
}

/** Costruisce un link di download solo da parti verificate (id + ΓΕΜΗ). */
export function buildGreekDownloadUrl(
  kind: string,
  elementId: string | number,
  arGemi: string,
): string | undefined {
  const url = greekDownloadUrl(kind, elementId, arGemi);
  return url && isGreekDocumentUrl(url) ? url : undefined;
}

/** Resolve the company's current public page to the direct filing document. */
export async function resolveGreekFilingUrl(
  gemi: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const response = await fetch(
    `https://publicity.businessportal.gr/company/${encodeURIComponent(gemi)}`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: signal ?? null,
    },
  );
  if (!response.ok) return undefined;
  return extractGreekFilingUrl(await response.text());
}
