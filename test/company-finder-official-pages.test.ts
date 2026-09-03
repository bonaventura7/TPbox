import { describe, expect, it } from "vitest";

import { officialPageFor } from "../src/lib/company-finder/official-pages";

/**
 * Il riquadro di consultazione ufficiale è l'unico punto in cui il browser
 * dell'utente contatta un registro. Gli URL devono quindi essere esatti e
 * puntare solo ai registri veri.
 */
describe("consultazione ufficiale incorporata", () => {
  it("Lussemburgo: RCS usa la scheda depositi LBR", () => {
    expect(officialPageFor("LU", "B60814", "")?.url).toBe(
      "https://www.lbr.lu/mjrcs-web-front/consult-company/B60814?tab=deposit",
    );
    expect(officialPageFor("LU", "B-60 814", "")?.url).toBe(
      "https://www.lbr.lu/mjrcs-web-front/consult-company/B60814?tab=deposit",
    );
  });

  it("Grecia: un GEMI a 10 cifre usa il link company/publicity", () => {
    const page = officialPageFor("GR", "1797901000", "");
    expect(page?.url).toBe("https://publicity.businessportal.gr/company/1797901000");
    expect(page?.note).toContain("CAPTCHA");
  });

  it("Polonia: KRS apre RDF e guida al documento Roczne sprawozdanie finansowe", () => {
    const page = officialPageFor("PL", "0000002594", "");
    expect(page?.url).toBe("https://rdf-przegladarka.ms.gov.pl/wyszukaj-podmiot");
    expect(page?.note).toContain("KRS 0000002594");
    expect(page?.note).toContain("Szukaj");
    expect(page?.note).toContain("Roczne sprawozdanie finansowe");
    expect(page?.note).toContain("Pobierz dokument");
  });

  it("Danimarca: per numero usa la scheda, senza numero la ricerca per nome", () => {
    expect(officialPageFor("DK", "58495913", "")?.url).toBe(
      "https://datacvr.virk.dk/enhed/virksomhed/58495913",
    );
    const perNome = officialPageFor("DK", "", "Pettinaroli A/S")?.url ?? "";
    expect(perNome).toContain("datacvr.virk.dk/soegeresultater");
    expect(perNome).toContain(encodeURIComponent("Pettinaroli A/S"));
  });

  it("Belgio: il numero BCE viene portato a dieci cifre", () => {
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
    for (const iso of ["DK", "BE", "DE", "LU", "GR", "PL"]) {
      const identifier = iso === "LU" ? "B60814" : iso === "GR" ? "1797901000" : "12345678";
      const page = officialPageFor(iso, identifier, "Prova");
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
