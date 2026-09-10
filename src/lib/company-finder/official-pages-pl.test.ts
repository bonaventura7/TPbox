import { describe, expect, it } from "vitest";

import { officialPageFor } from "./official-pages";

/**
 * Destinazione ufficiale per i bilanci polacchi delle società NON quotate.
 * Per le quotate i valori arrivano da ESEF (filings.xbrl.org); per le altre la
 * consultazione avviene nel visualizzatore istituzionale del Repozytorium
 * Dokumentów Finansowych (Ministerstwo Sprawiedliwości), non su portali terzi
 * commerciali né sul deep-link cifrato (che non è riproducibile da server).
 */
describe("Poland financial document destination", () => {
  it("punta al visualizzatore istituzionale RDF con il KRS normalizzato", () => {
    const page = officialPageFor(
      "PL",
      "0000002594",
      '"AVIO POLSKA" SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
    );

    expect(page?.url).toBe("https://rdf-przegladarka.ms.gov.pl/wyszukaj-podmiot");
    expect(page?.actionLabel).toBe("Apri il registro ufficiale");
    expect(page?.note).toContain("KRS 0000002594");
    expect(page?.url).not.toContain("aleo.com");
    expect(page?.url).not.toContain("imsig.pl");
  });

  it("non ricade su un portale terzo quando la denominazione è verificata", () => {
    const page = officialPageFor("PL", "0000002594", "AVIO POLSKA");

    expect(page?.url).toBe("https://rdf-przegladarka.ms.gov.pl/wyszukaj-podmiot");
    expect(page?.url).not.toContain("aleo.com");
  });
});
