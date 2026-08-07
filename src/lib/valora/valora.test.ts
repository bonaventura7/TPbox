import { describe, expect, it } from "vitest";

import { filterItems, valoraCatalog } from "./catalog";
import { daysSince, inspectCatalog, isAllowedUrl } from "./validator";
import { backoffDelayMs, idempotencyKey } from "./resilience.contracts";
import { betaLevered, computeWacc } from "./wacc";

describe("catalogo Valora", () => {
  it("ha id stabili e unici", () => {
    const ids = valoraCatalog.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("riferisce solo fonti registrate", () => {
    const sourceIds = new Set(valoraCatalog.sources.map((s) => s.id));
    for (const item of valoraCatalog.items) expect(sourceIds.has(item.sourceId)).toBe(true);
  });

  it("copre i moduli richiesti", () => {
    for (const id of [
      "valora-wacc",
      "valora-beta",
      "valora-crp",
      "valora-credit-spread",
      "valora-dcf-fcff",
    ]) {
      expect(valoraCatalog.items.some((item) => item.id === id)).toBe(true);
    }
  });

  it("filtra per testo, categoria e stato", () => {
    expect(filterItems(valoraCatalog.items, { query: "wacc" }).length).toBeGreaterThan(0);
    expect(filterItems(valoraCatalog.items, { query: "zzz-non-esiste" })).toHaveLength(0);
    expect(
      filterItems(valoraCatalog.items, { category: "VALUATION" }).every(
        (i) => i.category === "VALUATION",
      ),
    ).toBe(true);
    expect(
      filterItems(valoraCatalog.items, { status: "STALE" }).every((i) => i.status === "STALE"),
    ).toBe(true);
  });
});

describe("inspector", () => {
  it("accetta solo URL HTTPS su host in allowlist", () => {
    expect(isAllowedUrl("https://pages.stern.nyu.edu/x")).toBe(true);
    expect(isAllowedUrl("http://pages.stern.nyu.edu/x")).toBe(false);
    expect(isAllowedUrl("https://example.com/x")).toBe(false);
    expect(isAllowedUrl("non-un-url")).toBe(false);
  });

  it("non produce errori bloccanti sul catalogo corrente", () => {
    const report = inspectCatalog();
    expect(report.errors).toBe(0);
    expect(report.passed).toBe(true);
  });

  it("segnala metadati mancanti", () => {
    const report = inspectCatalog();
    const codes = report.findings.map((f) => f.code);
    expect(codes).toContain("VERIFICATION_MISSING");
    expect(codes).toContain("VERSION_MISSING");
  });

  it("calcola l'età della verifica", () => {
    expect(daysSince("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysSince("non-data", "2026-01-31")).toBeNull();
  });
});

describe("utilità HA", () => {
  it("applica backoff esponenziale", () => {
    expect(backoffDelayMs(0)).toBe(250);
    expect(backoffDelayMs(1)).toBe(500);
    expect(backoffDelayMs(2)).toBe(1000);
    expect(backoffDelayMs(0, undefined, 1)).toBe(370);
  });

  it("produce chiavi di idempotenza stabili", () => {
    expect(idempotencyKey("check", "src-damodaran")).toBe(idempotencyKey("check", "src-damodaran"));
    expect(idempotencyKey("check", "a")).not.toBe(idempotencyKey("check", "b"));
  });
});

describe("modulo WACC", () => {
  const base = {
    riskFreeBp: 350,
    equityRiskPremiumBp: 550,
    countryRiskPremiumBp: 150,
    betaUnleveredMilli: 900,
    creditSpreadBp: 200,
    taxRateBp: 2400,
    debt: 400,
    equity: 600,
  };

  it("calcola beta levered secondo Hamada", () => {
    expect(betaLevered(900, 2400, 400, 600)).toBe(1356);
  });

  it("restituisce un WACC coerente", () => {
    const out = computeWacc(base);
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.betaLeveredMilli).toBe(1356);
    expect(out.costOfEquityBp).toBe(1246);
    expect(out.costOfDebtBp).toBe(550);
    expect(out.afterTaxCostOfDebtBp).toBe(418);
    expect(out.equityWeightBp).toBe(6000);
    expect(out.debtWeightBp).toBe(4000);
    expect(out.waccBp).toBe(915);
  });

  it("blocca input non validi", () => {
    expect(computeWacc({ ...base, debt: 0, equity: 0 }).status).toBe("blocked");
    expect(computeWacc({ ...base, taxRateBp: 12000 }).status).toBe("blocked");
    expect(computeWacc({ ...base, riskFreeBp: -1 }).status).toBe("blocked");
  });
});
