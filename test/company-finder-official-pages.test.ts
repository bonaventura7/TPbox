import { describe, expect, it } from "vitest";

import {
  gemiFromInput,
  krsFromInput,
  officialPageFor,
  rcsFromInput,
} from "../src/lib/company-finder/official-pages";
import { runSearch } from "../src/lib/company-finder/orchestrator";

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

  it("DK, BE e DE restano incorporate in pagina (iframe), non esterne", () => {
    // Per questi registri l'incorporamento è verificato e deve restare tale.
    expect(officialPageFor("DK", "58495913", "")?.mode).toBe("embed");
    expect(officialPageFor("BE", "479523260", "")?.mode).toBe("embed");
    expect(officialPageFor("DE", "", "Siemens AG")?.mode).toBe("embed");
    expect(officialPageFor("DE", "", "Siemens AG")?.url).toBe(
      "https://www.unternehmensregister.de/ureg/",
    );
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

/**
 * LU, GR e PL non vanno incorporati: autenticazione, CAPTCHA e sessione
 * devono avvenire nel contesto principale del browser dell'utente. La pagina
 * si apre in una nuova scheda, con istruzioni precise e mai automatizzando
 * credenziali o verifiche.
 */
describe("consultazione diretta nel browser (LU, GR, PL)", () => {
  it("Lussemburgo: RCS noto → link diretto alla scheda con i depositi", () => {
    const page = officialPageFor("LU", "B60814", "");
    expect(page?.url).toBe("https://www.lbr.lu/mjrcs-web-front/consult-company/B60814?tab=deposit");
    expect(page?.mode).toBe("external");
    // L'autenticazione resta un gesto dell'utente sul portale ufficiale.
    expect(page?.instructions?.join(" ")).toMatch(/autenticazione/i);
    expect(page?.instructions?.join(" ")).toContain("LuxTrust");
  });

  it("Lussemburgo: l'RCS arriva anche dall'identificativo di registro risolto", () => {
    expect(officialPageFor("LU", "", "Société Exemple", "B 60-814")?.url).toBe(
      "https://www.lbr.lu/mjrcs-web-front/consult-company/B60814?tab=deposit",
    );
  });

  it("Lussemburgo: senza RCS si apre il portale ufficiale, mai un RCS inventato", () => {
    // 12345678 ha la forma di un'IVA lussemburghese: non diventa mai un RCS.
    const page = officialPageFor("LU", "12345678", "");
    expect(page?.url).toBe("https://www.lbr.lu/mjrcs-web-front/");
    expect(page?.mode).toBe("external");
  });

  it("normalizza l'RCS ma non lo deriva mai da sole cifre", () => {
    expect(rcsFromInput("B60814")).toBe("B60814");
    expect(rcsFromInput("b 60-814")).toBe("B60814");
    expect(rcsFromInput("LU B60814")).toBe("B60814");
    expect(rcsFromInput("12345678")).toBeUndefined();
    expect(rcsFromInput("LU12345678")).toBeUndefined();
    expect(rcsFromInput("")).toBeUndefined();
  });

  it("Grecia: identificativo ΓΕΜΗ a 10 cifre → scheda diretta sul portale", () => {
    const page = officialPageFor("GR", "1797901000", "");
    expect(page?.url).toBe("https://publicity.businessportal.gr/company/1797901000");
    expect(page?.mode).toBe("external");
    expect(page?.instructions?.join(" ")).toMatch(/CAPTCHA/);
  });

  it("Grecia: senza ΓΕΜΗ si apre la home ufficiale del portale", () => {
    expect(officialPageFor("GR", "", "Prova")?.url).toBe("https://publicity.businessportal.gr/");
  });

  it("classifica ΓΕΜΗ solo con 10 cifre esatte: l'IVA greca (9 cifre) va al VIES", () => {
    expect(gemiFromInput("1797901000")).toBe("1797901000");
    expect(gemiFromInput("094014201")).toBeUndefined(); // IVA greca: 9 cifre
    expect(gemiFromInput("EL094014201")).toBeUndefined();
    expect(gemiFromInput("17979010001")).toBeUndefined(); // 11 cifre
  });

  it("Polonia: portale RDF ufficiale con il percorso «Roczne sprawozdanie finansowe»", () => {
    const page = officialPageFor("PL", "0000002594", "");
    // Nessun parametro di ricerca inventato: l'URL è quello nudo del portale.
    expect(page?.url).toBe("https://rdf-przegladarka.ms.gov.pl/wyszukaj-podmiot");
    expect(page?.mode).toBe("external");
    const steps = page?.instructions?.join(" ") ?? "";
    expect(steps).toContain("KRS 0000002594");
    expect(steps).toContain("«Szukaj»");
    expect(steps).toContain("«Roczne sprawozdanie finansowe»");
    expect(steps).toContain("«Pobierz dokument»");
    expect(steps).toMatch(/periodo/i);
  });

  it("Polonia: il KRS arriva anche dal profilo di registro e va a 10 cifre", () => {
    const page = officialPageFor("PL", "", "ORLEN", "KRS 0000028860");
    expect(page?.instructions?.join(" ")).toContain("KRS 0000028860");
    expect(krsFromInput("28860")).toBeUndefined(); // né 8 né 10 cifre
    expect(krsFromInput("00028860")).toBe("0000028860"); // 8 cifre storiche
    expect(krsFromInput("0000002594")).toBe("0000002594");
    expect(krsFromInput("7740001454")).toBeUndefined(); // NIP, non KRS
  });
});

/**
 * Classificazione dell'input nell'orchestratore: gli identificativi di
 * registro (ΓΕΜΗ, RCS) non devono MAI essere spediti al VIES come IVA.
 */
describe("classificazione dell'input (niente VIES per ΓΕΜΗ e RCS)", () => {
  it("GR + 10 cifre: nessuna consultazione VIES, scheda ΓΕΜΗ diretta", async () => {
    const r = await runSearch({ query: "", vat: "1797901000", country: "GR" });
    expect(r.sources.some((s) => s.id === "vies")).toBe(false);
    expect(r.officialPage?.url).toBe("https://publicity.businessportal.gr/company/1797901000");
    expect(r.officialPage?.mode).toBe("external");
  });

  it("LU + RCS: nessuna consultazione VIES, scheda LBR diretta sui depositi", async () => {
    const r = await runSearch({ query: "", vat: "B60814", country: "LU" });
    expect(r.sources.some((s) => s.id === "vies")).toBe(false);
    expect(r.officialPage?.url).toBe(
      "https://www.lbr.lu/mjrcs-web-front/consult-company/B60814?tab=deposit",
    );
  });
});
