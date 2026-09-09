import { describe, expect, it } from "vitest";

import { gemiFromInput, looksLikeGreekFinancialDocument } from "./gemi-gr";

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
