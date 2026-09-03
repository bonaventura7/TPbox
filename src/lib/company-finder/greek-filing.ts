const GREEK_FILING_RE = /https?:\/\/filings\.businessportal\.gr\/ixbrl\/[^\s"'<>]+?_ixbrlview\.html/gi;

/** Extract the first direct G.E.MI. iXBRL filing link exposed by the company page. */
export function extractGreekFilingUrl(html: string): string | undefined {
  const match = html.match(GREEK_FILING_RE)?.[0];
  if (!match) return undefined;
  return match.replace(/&amp;/g, "&");
}

/** Resolve the company's current public page to the direct filing document. */
export async function resolveGreekFilingUrl(
  gemi: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const response = await fetch(`https://publicity.businessportal.gr/company/${encodeURIComponent(gemi)}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: signal ?? null,
  });
  if (!response.ok) return undefined;
  return extractGreekFilingUrl(await response.text());
}
