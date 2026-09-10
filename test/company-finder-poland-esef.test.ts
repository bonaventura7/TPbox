import { afterEach, describe, expect, it, vi } from "vitest";

import {
  esefFiscalYear,
  extractEsefFinancials,
  parseEsefFilingList,
} from "../src/lib/company-finder/sources/bilanci/poland-esef";

/**
 * Fixture ricavata dal deposito ESEF reale di INSTAL KRAKÓW S.A. (LEI
 * 259400OOMJ31L0SWCY70, FY2022) su filings.xbrl.org. Riproduce le DUE trappole
 * misurate sui dati veri:
 *   1. gli istanti patrimoniali sono datati al 1° gennaio dell'anno DOPO
 *      (Assets/Equity FY2022 hanno period "2023-01-01");
 *   2. Equity compare anche con un asse (ComponentsOfEquityAxis) a 7.285.500,
 *      che è il capitale sociale, non il patrimonio netto.
 */
const INSTAL_KRAKOW_FY2022 = {
  facts: {
    fRevenue2022: {
      value: "397560443.25",
      dimensions: {
        concept: "ifrs-full:Revenue",
        entity: "scheme:259400OOMJ31L0SWCY70",
        period: "2022-01-01T00:00:00/2023-01-01T00:00:00",
        unit: "iso4217:PLN",
      },
    },
    fRevenue2021: {
      value: "380466541.53",
      dimensions: {
        concept: "ifrs-full:Revenue",
        entity: "scheme:259400OOMJ31L0SWCY70",
        period: "2021-01-01T00:00:00/2022-01-01T00:00:00",
        unit: "iso4217:PLN",
      },
    },
    fEbit2022: {
      value: "36220363.07",
      dimensions: {
        concept: "ifrs-full:ProfitLossFromOperatingActivities",
        entity: "scheme:259400OOMJ31L0SWCY70",
        period: "2022-01-01T00:00:00/2023-01-01T00:00:00",
        unit: "iso4217:PLN",
      },
    },
    // TRAPPOLA 1: l'attivo di fine FY2022 è datato 2023-01-01.
    fAssets2022: {
      value: "464681115.92",
      dimensions: {
        concept: "ifrs-full:Assets",
        entity: "scheme:259400OOMJ31L0SWCY70",
        period: "2023-01-01T00:00:00",
        unit: "iso4217:PLN",
      },
    },
    fAssets2021: {
      value: "438395039.49",
      dimensions: {
        concept: "ifrs-full:Assets",
        entity: "scheme:259400OOMJ31L0SWCY70",
        period: "2022-01-01T00:00:00",
        unit: "iso4217:PLN",
      },
    },
    // Patrimonio netto vero di fine FY2022 (istante 2023-01-01, nessun asse).
    fEquity2022: {
      value: "322923938.15",
      dimensions: {
        concept: "ifrs-full:Equity",
        entity: "scheme:259400OOMJ31L0SWCY70",
        period: "2023-01-01T00:00:00",
        unit: "iso4217:PLN",
      },
    },
    // TRAPPOLA 2: stesso concetto Equity ma con un asse → è il capitale sociale,
    // NON il patrimonio netto. Va scartato.
    fEquityComponent: {
      value: "7285500",
      dimensions: {
        concept: "ifrs-full:Equity",
        entity: "scheme:259400OOMJ31L0SWCY70",
        period: "2023-01-01T00:00:00",
        unit: "iso4217:PLN",
        "ifrs-full:ComponentsOfEquityAxis": "ifrs-full:IssuedCapitalMember",
      },
    },
  },
};

const FILINGS_LIST = {
  data: [
    {
      type: "filing",
      attributes: {
        period_end: "2022-12-31",
        json_url: "/259400OOMJ31L0SWCY70/2022-12-31/ESEF/PL/0/259400OOMJ31L0SWCY70-2022-12-31.json",
        viewer_url:
          "/259400OOMJ31L0SWCY70/2022-12-31/ESEF/PL/0/259400OOMJ31L0SWCY70-31-12-2022-PL/reports/ixbrlviewer.html",
        error_count: 0,
      },
    },
    {
      type: "filing",
      attributes: {
        period_end: "2021-12-31",
        json_url: "/259400OOMJ31L0SWCY70/2021-12-31/ESEF/PL/0/259400OOMJ31L0SWCY70-2021-12-31.json",
        viewer_url: null,
        error_count: 0,
      },
    },
    {
      // Filing senza json_url: deve essere tollerato, non far cadere il parsing.
      type: "filing",
      attributes: {
        period_end: "2020-12-31",
        json_url: null,
        viewer_url: null,
        error_count: 0,
      },
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("ESEF Polonia — esercizio fiscale dagli istanti/durate", () => {
  it("un istante al 1° gennaio appartiene all'esercizio precedente (trappola 1)", () => {
    expect(esefFiscalYear("2023-01-01T00:00:00")).toBe(2022);
    expect(esefFiscalYear("2022-01-01T00:00:00")).toBe(2021);
  });

  it("una durata start/end appartiene all'anno di inizio", () => {
    expect(esefFiscalYear("2022-01-01T00:00:00/2023-01-01T00:00:00")).toBe(2022);
    expect(esefFiscalYear("2021-01-01T00:00:00/2022-01-01T00:00:00")).toBe(2021);
  });

  it("un istante non di inizio anno resta nel proprio anno", () => {
    expect(esefFiscalYear("2022-12-31T00:00:00")).toBe(2022);
  });
});

describe("ESEF Polonia — estrazione dei valori con le trappole neutralizzate", () => {
  it("associa i valori all'esercizio corretto e ignora i fatti dimensionati", () => {
    const years = extractEsefFinancials(INSTAL_KRAKOW_FY2022, "PLN");
    const y2022 = years.find((y) => y.year === 2022);
    expect(y2022).toBeDefined();
    expect(y2022?.revenue).toBeCloseTo(397560443.25, 2);
    expect(y2022?.operatingProfit).toBeCloseTo(36220363.07, 2);
    // Trappola 1: l'attivo datato 2023-01-01 è FY2022, non FY2023.
    expect(y2022?.totalAssets).toBeCloseTo(464681115.92, 2);
    // Trappola 2: il patrimonio netto è 322,9M, NON il capitale sociale 7,28M.
    expect(y2022?.equity).toBeCloseTo(322923938.15, 2);
    expect(y2022?.currency).toBe("PLN");
  });

  it("non crea alcun esercizio 2023 fantasma dagli istanti di chiusura", () => {
    const years = extractEsefFinancials(INSTAL_KRAKOW_FY2022, "PLN");
    expect(years.some((y) => y.year === 2023)).toBe(false);
  });

  it("ricostruisce anche l'esercizio precedente dai comparativi", () => {
    const years = extractEsefFinancials(INSTAL_KRAKOW_FY2022, "PLN");
    const y2021 = years.find((y) => y.year === 2021);
    expect(y2021?.revenue).toBeCloseTo(380466541.53, 2);
    expect(y2021?.totalAssets).toBeCloseTo(438395039.49, 2);
  });
});

describe("ESEF Polonia — lista dei depositi per LEI", () => {
  it("tiene solo i filing con json_url e li ordina per esercizio decrescente", () => {
    const filings = parseEsefFilingList(FILINGS_LIST);
    expect(filings.map((f) => f.year)).toEqual([2022, 2021]);
    expect(filings[0]?.jsonUrl).toContain("https://filings.xbrl.org/");
    expect(filings[0]?.viewerUrl).toContain("ixbrlviewer.html");
  });

  it("un filing senza json_url non compare nella lista", () => {
    const filings = parseEsefFilingList(FILINGS_LIST);
    expect(filings.some((f) => f.year === 2020)).toBe(false);
  });
});
