import { describe, expect, it } from "vitest";

import { ALL_COUNTRIES } from "../src/lib/company-finder/countries";
import {
  AUTO_ISOS,
  CONSULT_PAGES,
  NO_FREE_SOURCE,
  isCovered,
} from "../src/lib/company-finder/coverage";
import { officialPageFor } from "../src/lib/company-finder/official-pages";

/**
 * La copertura è una promessa fatta all'utente: questi test impediscono che
 * un paese finisca in due livelli, o che se ne prometta uno che si paga.
 */
describe("copertura dichiarata", () => {
  it("nessun paese sta in due livelli contemporaneamente", () => {
    for (const iso of AUTO_ISOS) {
      expect(iso in CONSULT_PAGES, `${iso} è sia automatico sia consultabile`).toBe(false);
      expect(iso in NO_FREE_SOURCE, `${iso} è sia automatico sia a pagamento`).toBe(false);
    }
    for (const iso of Object.keys(CONSULT_PAGES)) {
      expect(iso in NO_FREE_SOURCE, `${iso} è sia consultabile sia a pagamento`).toBe(false);
    }
  });

  it("ogni codice citato esiste nel catalogo paesi", () => {
    const known = new Set(ALL_COUNTRIES.map((c) => c.iso));
    for (const iso of [
      ...AUTO_ISOS,
      ...Object.keys(CONSULT_PAGES),
      ...Object.keys(NO_FREE_SOURCE),
    ]) {
      expect(known.has(iso), `${iso} non è nel catalogo`).toBe(true);
    }
  });

  it("i paesi senza fonte gratuita non sono coperti e non offrono una pagina", () => {
    for (const iso of Object.keys(NO_FREE_SOURCE)) {
      expect(isCovered(iso), iso).toBe(false);
      expect(officialPageFor(iso, "12345678", "Prova"), iso).toBeUndefined();
      // La nota deve dire perché, non limitarsi a negare.
      expect(NO_FREE_SOURCE[iso]!.length, iso).toBeGreaterThan(40);
    }
  });

  it("ogni paese consultabile ha una pagina ufficiale https con etichetta", () => {
    for (const iso of Object.keys(CONSULT_PAGES)) {
      const page = officialPageFor(iso, "", "Prova");
      expect(page, iso).toBeDefined();
      expect(page!.url.startsWith("https://"), iso).toBe(true);
      expect(page!.label.length, iso).toBeGreaterThan(5);
    }
  });

  it("l'Italia è fuori copertura e lo dice apertamente", () => {
    expect(isCovered("IT")).toBe(false);
    expect(NO_FREE_SOURCE["IT"]).toMatch(/CCIAA/);
  });

  it("la Grecia è coperta via consultazione ufficiale", () => {
    expect(isCovered("GR")).toBe(true);
    expect(officialPageFor("GR", "", "")?.url).toContain("businessportal.gr");
  });

  it("i nove paesi esclusi restano fuori dal menu a tendina", () => {
    // Il dropdown della pagina deriva da isCovered: se uno di questi tornasse
    // coperto per errore, ricomparirebbe nel menu. Questo test lo impedisce.
    for (const iso of ["IT", "ES", "AT", "SE", "IS", "LI", "IE", "CY", "MT"]) {
      expect(isCovered(iso), iso).toBe(false);
    }
  });
});
