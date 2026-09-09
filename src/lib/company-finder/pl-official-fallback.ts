const POLISH_RDF_BROWSER = "https://rdf-przegladarka.ms.gov.pl/wyszukaj-podmiot";

export function polishOfficialBrowserUrl(krs: string): string {
  const normalized = krs.replace(/\D/g, "").padStart(10, "0");
  if (!/^\d{10}$/.test(normalized)) throw new Error("KRS non valido");
  return `${POLISH_RDF_BROWSER}?krs=${encodeURIComponent(normalized)}`;
}
