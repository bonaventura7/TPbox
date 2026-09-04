import { describe, expect, it } from "vitest";
import { metricById, REFERENCE_RATES } from "./registry";

describe("USD Treasury reference registry", () => {
  it("uses the primary Treasury source for every supported USD tenor", () => {
    const tenors = ["3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y"] as const;
    for (const tenor of tenors) {
      const id = REFERENCE_RATES.USD[tenor];
      expect(id).toBeDefined();
      const metric = metricById(id!);
      expect(metric?.source).toBe("TREASURY");
      expect(metric?.series).toMatch(/^BC_/);
      expect(metric?.verified).toBe(true);
    }
  });
});
