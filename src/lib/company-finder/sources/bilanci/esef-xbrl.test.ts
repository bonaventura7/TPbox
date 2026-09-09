import { describe, expect, it } from "vitest";

import {
  extractEsefYears,
  fiscalYearFromInstant,
  fiscalYearFromPeriod,
  isUndimensionedFact,
  isValidLei,
} from "./esef-xbrl";

/** Fatto xBRL-JSON minimo, nella forma verificata su filings.xbrl.org. */
function fact(concept: string, period: string, value: string, extra: Record<string, string> = {}) {
  return { value, decimals: 2, dimensions: { concept, entity: "scheme:X", period, unit: "iso4217:PLN", ...extra } };
}

describe("esef — esercizio di riferimento", () => {
  it("tratta l'istante al 1° gennaio come chiusura dell'esercizio precedente", () => {
    expect(fiscalYearFromInstant("2023-01-01T00:00:00")).toBe(2022);
  });

  it("lascia intatta una chiusura al 31 dicembre", () => {
    expect(fiscalYearFromInstant("2022-12-31T00:00:00")).toBe(2022);
  });

  it("legge la fine di una durata, con la stessa correzione", () => {
    expect(fiscalYearFromPeriod("2022-01-01T00:00:00/2023-01-01T00:00:00")).toBe(2022);
  });

  it("regge una chiusura infrannuale", () => {
    expect(fiscalYearFromPeriod("2021-07-01T00:00:00/2022-06-30T00:00:00")).toBe(2022);
  });

  it("rifiuta una data non interpretabile", () => {
    expect(fiscalYearFromInstant("non una data")).toBeUndefined();
  });
});

describe("esef — fatti dimensionali", () => {
  it("riconosce come totale solo il fatto privo di assi", () => {
    expect(isUndimensionedFact({ concept: "ifrs-full:Equity", entity: "e", period: "p", unit: "u" })).toBe(true);
    expect(
      isUndimensionedFact({ concept: "ifrs-full:Equity", entity: "e", period: "p", unit: "u", "ifrs-full:ComponentsOfEquityAxis": "x" }),
    ).toBe(false);
  });

  it("non scambia il capitale sociale per il patrimonio netto", () => {
    const payload = {
      facts: {
        a: fact("ifrs-full:Equity", "2023-01-01T00:00:00", "322923938.15"),
        b: fact("ifrs-full:Equity", "2023-01-01T00:00:00", "7285500", { "ifrs-full:ComponentsOfEquityAxis": "ifrs-full:IssuedCapitalMember" }),
      },
    };
    const { years } = extractEsefYears(payload);
    expect(years).toHaveLength(1);
    expect(years[0]?.year).toBe(2022);
    expect(years[0]?.equity).toBe(322923938.15);
  });
});

describe("esef — disciplina istante/durata", () => {
  it("non prende come utile d'esercizio un ProfitLoss istantaneo", () => {
    const payload = {
      facts: {
        a: fact("ifrs-full:ProfitLoss", "2022-01-01T00:00:00/2023-01-01T00:00:00", "30433567.4"),
        b: fact("ifrs-full:ProfitLoss", "2023-01-01T00:00:00", "999999"),
      },
    };
    const { years } = extractEsefYears(payload);
    expect(years.find((entry) => entry.year === 2022)?.netIncome).toBe(30433567.4);
  });

  it("non prende come totale attivo un Assets di durata", () => {
    const payload = { facts: { a: fact("ifrs-full:Assets", "2022-01-01T00:00:00/2023-01-01T00:00:00", "1") } };
    expect(extractEsefYears(payload).years).toHaveLength(0);
  });
});

describe("esef — preferenza fra concetti e valuta", () => {
  it("preferisce Revenue a RevenueFromContractsWithCustomers", () => {
    const payload = {
      facts: {
        a: fact("ifrs-full:RevenueFromContractsWithCustomers", "2022-01-01T00:00:00/2023-01-01T00:00:00", "100"),
        b: fact("ifrs-full:Revenue", "2022-01-01T00:00:00/2023-01-01T00:00:00", "200"),
      },
    };
    expect(extractEsefYears(payload).years[0]?.revenue).toBe(200);
  });

  it("legge la valuta dal fatto e non la presume in euro", () => {
    const payload = { facts: { a: fact("ifrs-full:Assets", "2023-01-01T00:00:00", "10") } };
    const result = extractEsefYears(payload);
    expect(result.currency).toBe("PLN");
    expect(result.years[0]?.currency).toBe("PLN");
  });

  it("scarta un fatto senza unità monetaria riconoscibile", () => {
    const payload = {
      facts: {
        a: { value: "3", dimensions: { concept: "ifrs-full:Assets", entity: "e", period: "2023-01-01T00:00:00", unit: "xbrli:pure" } },
      },
    };
    expect(extractEsefYears(payload).years).toHaveLength(0);
  });
});

describe("esef — LEI", () => {
  it("accetta un LEI valido e rifiuta le forme corte", () => {
    expect(isValidLei("259400OOMJ31L0SWCY70")).toBe(true);
    expect(isValidLei("259400OOMJ31L0SWCY7")).toBe(false);
  });
});
