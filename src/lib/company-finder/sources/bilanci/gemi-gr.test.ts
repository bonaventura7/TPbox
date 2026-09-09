import { describe, expect, it } from "vitest";

import {
  gemiFromInput,
  looksLikeGreekFinancialDocument,
} from "./gemi-gr";
import { parseGreekFinancialDocument } from "./gemi-gr-financials";

describe("gemiFromInput", () => {
  it("accepts a 10-digit GEMI number from the query", () => {
    expect(gemiFromInput("", "2636010000")).toBe("2636010000");
  });

  it("does not mistake the 9-digit Greek VAT for a GEMI number", () => {
    expect(gemiFromInput("123456789", "")).toBeUndefined();
  });
});

describe("looksLikeGreekFinancialDocument", () => {
  it("recognizes Greek financial-statement subjects", () => {
    expect(
      looksLikeGreekFinancialDocument({ decisionSubject: "Έγκριση οικονομικών καταστάσεων" }),
    ).toBe(true);
  });

  it("recognizes an iXBRL filing URL", () => {
    expect(
      looksLikeGreekFinancialDocument({
        url: "https://filings.businessportal.gr/ixbrl/abc_ixbrlview.html",
      }),
    ).toBe(true);
  });

  it("rejects a generic company announcement", () => {
    expect(
      looksLikeGreekFinancialDocument({ decisionSubject: "Αλλαγή έδρας εταιρείας" }),
    ).toBe(false);
  });
});

describe("parseGreekFinancialDocument", () => {
  it("parses European Greek number formats and negative values", () => {
    const result = parseGreekFinancialDocument({
      text: "ΟΙΚΟΝΟΜΙΚΕΣ ΚΑΤΑΣΤΑΣΕΙΣ 2024\nΚύκλος εργασιών 1.234.567,89\nΚαθαρά κέρδη (12.345,67)",
    });

    expect(result.matched).toBe(true);
    expect(result.years[0]?.revenue).toBe(1234567.89);
    expect(result.years[0]?.netIncome).toBe(-12345.67);
    expect(result.years[0]?.currency).toBe("EUR");
  });

  it("maps Greek financial labels to two statement years", () => {
    const result = parseGreekFinancialDocument({
      text: `
        ΟΙΚΟΝΟΜΙΚΕΣ ΚΑΤΑΣΤΑΣΕΙΣ 2024 2023
        Κύκλος εργασιών 10.500.000,00 9.250.000,00
        Σύνολο ενεργητικού 18.100.000,00 16.900.000,00
        Ίδια κεφάλαια 7.400.000,00 6.900.000,00
        Καθαρά κέρδη μετά φόρων 820.000,00 710.000,00
      `,
    });

    expect(result.matched).toBe(true);
    expect(result.years).toEqual([
      expect.objectContaining({
        periodLabel: "2024",
        year: 2024,
        revenue: 10500000,
        totalAssets: 18100000,
        equity: 7400000,
        netIncome: 820000,
        currency: "EUR",
      }),
      expect.objectContaining({
        periodLabel: "2023",
        year: 2023,
        revenue: 9250000,
        totalAssets: 16900000,
        equity: 6900000,
        netIncome: 710000,
        currency: "EUR",
      }),
    ]);
  });

  it("does not fabricate financial values from an unrelated registry page", () => {
    const result = parseGreekFinancialDocument({
      text: "Αλλαγή έδρας εταιρείας — ΓΕΜΗ 2636010000 — νέα διεύθυνση Αθήνα",
    });

    expect(result.matched).toBe(false);
    expect(result.years).toEqual([]);
  });
});
