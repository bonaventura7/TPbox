// Verifica una volta sola contro i fatti REALI misurati il 10.09.2026 su
// filings.xbrl.org, LEI 259400OOMJ31L0SWCY70 (emittente polacco, FY2022).
import { describe, expect, it } from "vitest";
import { extractEsefFinancials } from "../src/lib/company-finder/sources/bilanci/poland-esef";

const f = (concept: string, period: string, value: number, axis?: string) => ({
  value,
  dimensions: {
    concept,
    entity: "lei:259400OOMJ31L0SWCY70",
    period,
    unit: "iso4217:PLN",
    ...(axis ? { "ifrs-full:ComponentsOfEquityAxis": axis } : {}),
  },
});

const live = {
  facts: {
    a1: f("ifrs-full:Assets", "2022-01-01T00:00:00", 438395039.49),
    a2: f("ifrs-full:Assets", "2023-01-01T00:00:00", 464681115.92),
    e1: f("ifrs-full:Equity", "2022-01-01T00:00:00", 303234364.83),
    e2: f("ifrs-full:Equity", "2023-01-01T00:00:00", 322923938.15),
    e0: f("ifrs-full:Equity", "2021-01-01T00:00:00", 278119913.01),
    r1: f("ifrs-full:Revenue", "2021-01-01T00:00:00/2022-01-01T00:00:00", 380466541.53),
    r2: f("ifrs-full:Revenue", "2022-01-01T00:00:00/2023-01-01T00:00:00", 397560443.25),
    o1: f(
      "ifrs-full:ProfitLossFromOperatingActivities",
      "2021-01-01T00:00:00/2022-01-01T00:00:00",
      36757146.16,
    ),
    o2: f(
      "ifrs-full:ProfitLossFromOperatingActivities",
      "2022-01-01T00:00:00/2023-01-01T00:00:00",
      36220363.07,
    ),
    p1: f("ifrs-full:ProfitLoss", "2021-01-01T00:00:00/2022-01-01T00:00:00", 27662253.79),
    p2: f("ifrs-full:ProfitLoss", "2022-01-01T00:00:00/2023-01-01T00:00:00", 30433567.4),
    p2bis: f("ifrs-full:ProfitLoss", "2022-01-01T00:00:00/2023-01-01T00:00:00", 30433567.4),
    // trappole reali: capitale sociale e riserve dimensionati su ComponentsOfEquityAxis
    x1: f("ifrs-full:Equity", "2023-01-01T00:00:00", 7285500, "ifrs-full:IssuedCapitalMember"),
    x2: f(
      "ifrs-full:Equity",
      "2023-01-01T00:00:00",
      295403968.58,
      "ifrs-full:RetainedEarningsMember",
    ),
    x3: f(
      "ifrs-full:ProfitLoss",
      "2022-01-01T00:00:00/2023-01-01T00:00:00",
      28981580.01,
      "ifrs-full:RetainedEarningsMember",
    ),
  },
};

describe("ESEF — fatti reali dell'emittente 259400OOMJ31L0SWCY70", () => {
  it("assegna ogni voce all'esercizio giusto e scarta i fatti dimensionati", () => {
    const years = extractEsefFinancials(live, "PLN");
    expect(years.map((y) => y.year)).toEqual([2022, 2021, 2020]);
    expect(years[0]).toMatchObject({
      year: 2022,
      currency: "PLN",
      revenue: 397560443.25,
      operatingProfit: 36220363.07,
      netIncome: 30433567.4,
      totalAssets: 464681115.92,
      equity: 322923938.15,
    });
    expect(years[1]).toMatchObject({
      year: 2021,
      revenue: 380466541.53,
      operatingProfit: 36757146.16,
      netIncome: 27662253.79,
      totalAssets: 438395039.49,
      equity: 303234364.83,
    });
    expect(years[2]).toMatchObject({ year: 2020, equity: 278119913.01 });
    // il capitale sociale non deve mai finire nel patrimonio netto
    expect(years.some((y) => y.equity === 7285500)).toBe(false);
  });
});
