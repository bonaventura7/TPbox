import { describe, expect, it } from "vitest";

import {
  krsFiscalYear,
  parseKrsFilings,
  buildKrsFilingsFinancials,
} from "../src/lib/company-finder/sources/bilanci/poland-krs-filings";

/**
 * Fixture ridotta ma FEDELE all'odpis KRS reale di "AVIO POLSKA" Sp. z o.o.
 * (KRS 0000002594), letto dall'API ufficiale api-krs.ms.gov.pl. Riproduce i tre
 * dialetti storici del campo `zaOkresOdDo` e l'array parallelo delle opinioni
 * del revisore (che marca gli esercizi come "auditati").
 */
const AVIO_POLSKA = {
  odpis: {
    dane: {
      dzial3: {
        wzmiankiOZlozonychDokumentach: {
          wzmiankaOZlozeniuRocznegoSprawozdaniaFinansowego: [
            { dataZlozenia: "01.04.2003", zaOkresOdDo: "ROK OBROTOWY 2002" },
            { dataZlozenia: "05.05.2010", zaOkresOdDo: "2009 ROK" },
            { dataZlozenia: "09.05.2024", zaOkresOdDo: "OD 01.01.2023 DO 31.12.2023" },
            { dataZlozenia: "13.05.2025", zaOkresOdDo: "OD 01.01.2024 DO 31.12.2024" },
            // Duplicato storico dello stesso esercizio con data precedente:
            { dataZlozenia: "01.01.2024", zaOkresOdDo: "OD 01.01.2023 DO 31.12.2023" },
          ],
          wzmiankaOZlozeniuOpiniiBieglegoRewidentaSprawozdaniaZBadania: [
            { zaOkresOdDo: "OD 01.01.2023 DO 31.12.2023" },
            { zaOkresOdDo: "OD 01.01.2024 DO 31.12.2024" },
          ],
        },
      },
    },
  },
};

describe("krsFiscalYear — dialetti storici di zaOkresOdDo", () => {
  it("estrae l'anno di chiusura da un intervallo OD ... DO ...", () => {
    expect(krsFiscalYear("OD 01.01.2024 DO 31.12.2024")).toBe(2024);
  });

  it("gestisce esercizi non solari usando la DATA FINALE (chiusura)", () => {
    expect(krsFiscalYear("OD 01.07.2023 DO 30.06.2024")).toBe(2024);
  });

  it("estrae l'anno dai formati testuali storici", () => {
    expect(krsFiscalYear("ROK OBROTOWY 2008")).toBe(2008);
    expect(krsFiscalYear("2009 ROK")).toBe(2009);
  });

  it("ritorna undefined per input privi di anno valido", () => {
    expect(krsFiscalYear("")).toBeUndefined();
    expect(krsFiscalYear("BRAK DANYCH")).toBeUndefined();
    expect(krsFiscalYear(undefined)).toBeUndefined();
  });
});

describe("parseKrsFilings — elenco depositi dall'odpis reale", () => {
  const entries = parseKrsFilings(AVIO_POLSKA);

  it("deduplica per esercizio e ordina dal più recente", () => {
    expect(entries.map((e) => e.year)).toEqual([2024, 2023, 2009, 2002]);
  });

  it("tiene la data di deposito più recente in caso di duplicati", () => {
    const y2023 = entries.find((e) => e.year === 2023)!;
    expect(y2023.filedOn).toBe("2024-05-09");
  });

  it("marca come auditati gli esercizi con opinione del revisore", () => {
    expect(entries.find((e) => e.year === 2024)!.audited).toBe(true);
    expect(entries.find((e) => e.year === 2023)!.audited).toBe(true);
    expect(entries.find((e) => e.year === 2009)!.audited).toBe(false);
  });

  it("costruisce etichette di periodo leggibili", () => {
    expect(entries.find((e) => e.year === 2024)!.periodLabel).toBe("01.01.2024 – 31.12.2024");
    expect(entries.find((e) => e.year === 2009)!.periodLabel).toBe("esercizio 2009");
  });

  it("accetta sia la radice completa sia l'oggetto odpis diretto", () => {
    expect(parseKrsFilings(AVIO_POLSKA.odpis).map((e) => e.year)).toEqual([2024, 2023, 2009, 2002]);
  });

  it("ritorna lista vuota se il Dział 3 non contiene wzmianki", () => {
    expect(parseKrsFilings({ odpis: { dane: { dzial3: {} } } })).toEqual([]);
    expect(parseKrsFilings(null)).toEqual([]);
  });
});

describe("buildKrsFilingsFinancials — vista client REGISTRY_ONLY", () => {
  const entries = parseKrsFilings(AVIO_POLSKA);
  const fin = buildKrsFilingsFinancials(entries)!;

  it("segnala i valori come non disponibili ma i depositi come consultabili", () => {
    expect(fin.available).toBe(false);
    expect(fin.availability).toBe("REGISTRY_ONLY");
    expect(fin.restriction).toBe("SESSION_BOUND");
  });

  it("espone un documento per esercizio, senza URL o token della fonte", () => {
    expect(fin.documents).toHaveLength(4);
    for (const doc of fin.documents!) {
      expect(doc.availability).toBe("REGISTRY_ONLY");
      expect(doc.downloadUrl).toBeUndefined();
    }
    const doc2024 = fin.documents!.find((d) => d.year === 2024)!;
    expect(doc2024.title).toContain("2024");
    expect(doc2024.title).toContain("2025-05-13");
    expect(doc2024.title).toContain("revisione");
  });

  it("cita la fonte ministeriale e spiega perché il download è manuale", () => {
    expect(fin.source).toContain("Ministerstwo Sprawiedliwości");
    expect(fin.note).toContain("2024");
    expect(fin.note).toContain("browser");
  });

  it("ritorna undefined quando non ci sono esercizi", () => {
    expect(buildKrsFilingsFinancials([])).toBeUndefined();
  });
});
