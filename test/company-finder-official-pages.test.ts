import { describe, expect, it } from "vitest";

import { officialPageFor } from "../src/lib/company-finder/official-pages";

/**
 * Il riquadro di consultazione ufficiale è l'unico punto in cui il browser
 * dell'utente contatta un registro. Gli URL devono quindi essere esatti e
 * puntare solo ai registri veri.
 */
describe("consultazione ufficiale incorporata", () => {
  it("Danimarca: per numero usa la scheda, senza numero la ricerca per nome", () => {
    expect(officialPageFor("DK", "58495913", "")?.url).toBe(
      "https://datacvr.virk.dk/enhed/virksomhed/58495913",
    );
    const perNome = officialPageFor("DK", "", "Pettinaroli A/S")?.url ?? "";
    expect(perNome).toContain("datacvr.virk.dk/soegeresultater");
    expect(perNome).toContain(encodeURIComponent("Pettinaroli A/S"));
  });

  it("Belgio: il numero BCE viene portato a dieci cifre", () => {
    // 479523260 è il numero senza lo zero iniziale: la NBB vuole 0479523260.
    expect(officialPageFor("BE", "479523260", "")?.url).toBe(
      "https://consult.cbso.nbb.be/consult-enterprise/0479523260",
    );
    expect(officialPageFor("BE", "0479.523.260", "")?.url).toBe(
      "https://consult.cbso.nbb.be/consult-enterprise/0479523260",
    );
  });

  it("accetta l'IVA danese con prefisso e ne tiene solo le cifre", () => {
    expect(officialPageFor("DK", "DK58495913", "")?.url).toContain("58495913");
  });

  it("ogni pagina dichiara etichetta e motivo", () => {
    // IT ed ES non compaiono: da quando la copertura è a tre livelli, i paesi
    // in cui il bilancio si paga non ricevono una pagina (vedi coverage.ts).
    for (const iso of ["DK", "BE", "DE", "LU"]) {
      const page = officialPageFor(iso, "12345678", "Prova");
      expect(page, iso).toBeDefined();
      expect(page!.label.length, iso).toBeGreaterThan(3);
      expect(page!.note.length, iso).toBeGreaterThan(30);
      expect(page!.url.startsWith("https://"), iso).toBe(true);
    }
  });

  it("non inventa una pagina per un codice paese inesistente", () => {
    expect(officialPageFor("ZZ", "123", "x")).toBeUndefined();
  });
});
