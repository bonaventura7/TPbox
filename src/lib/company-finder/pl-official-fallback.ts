const POLISH_RDF_BROWSER = "https://rdf-przegladarka.ms.gov.pl/wyszukaj-podmiot";

export const POLISH_OFFICIAL_FALLBACK_HEADER = "official-polish-rdf-browser";

export function polishOfficialBrowserUrl(krs: string): string {
  const normalized = krs.replace(/\D/g, "").padStart(10, "0");
  if (!/^\d{10}$/.test(normalized)) throw new Error("KRS non valido");
  return `${POLISH_RDF_BROWSER}?krs=${encodeURIComponent(normalized)}`;
}

export function polishOfficialFallbackResponse(krs: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: polishOfficialBrowserUrl(krs),
      "Cache-Control": "no-store",
      "X-Company-Finder-Fallback": POLISH_OFFICIAL_FALLBACK_HEADER,
    },
  });
}
