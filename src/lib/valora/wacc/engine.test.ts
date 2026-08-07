import { describe, expect, it } from "vitest";

import {
  betaLeveredMilli,
  computeWacc,
  costOfDebtGrossBp,
  costOfDebtNetBp,
  costOfEquityBp,
} from "./engine";
import { WACC_ENGINE_VERSION, WACC_METHODOLOGY_VERSION, type WaccInput } from "./model";
import { validateWaccInput, type RawWaccInput } from "./validation";
import { formatBpAsPercent, formatBeta } from "./format";

const AT = "2026-08-07T10:00:00.000Z";

function input(patch: Partial<WaccInput> = {}): WaccInput {
  return {
    riskFreeBp: 300,
    equityRiskPremiumBp: 550,
    countryRiskPremiumBp: 150,
    betaUnleveredMilli: 900,
    creditSpreadBp: 200,
    taxRateBp: 2400,
    debt: 400,
    equity: 600,
    countryRiskPremiumOmitted: false,
    ...patch,
  };
}

function raw(patch: Partial<RawWaccInput> = {}): RawWaccInput {
  return {
    riskFreePct: "3",
    equityRiskPremiumPct: "5.5",
    countryRiskPremiumPct: "1.5",
    betaUnlevered: "0.9",
    creditSpreadPct: "2",
    taxRatePct: "24",
    debt: "400",
    equity: "600",
    ...patch,
  };
}

describe("golden case 1 — struttura mista", () => {
  const result = computeWacc(input(), AT);

  it("è calcolabile", () => {
    expect(result.outcome).toBe("ok");
  });

  it("riproduce tutti i valori intermedi", () => {
    if (result.outcome !== "ok") throw new Error("atteso outcome ok");
    expect(result.breakdown.taxShieldFactor).toBeCloseTo(0.76, 12);
    expect(result.breakdown.debtToEquity).toBeCloseTo(400 / 600, 12);
    expect(result.breakdown.betaLeveredMilli).toBeCloseTo(1356, 9);
    expect(result.breakdown.costOfEquityBp).toBeCloseTo(1195.8, 9);
    expect(result.breakdown.costOfDebtGrossBp).toBe(500);
    expect(result.breakdown.costOfDebtNetBp).toBeCloseTo(380, 9);
    expect(result.breakdown.equityWeight).toBeCloseTo(0.6, 12);
    expect(result.breakdown.debtWeight).toBeCloseTo(0.4, 12);
    expect(result.waccBp).toBeCloseTo(869.48, 9);
  });

  it("espone versioni, snapshot e passaggi", () => {
    if (result.outcome !== "ok") throw new Error("atteso outcome ok");
    expect(result.engineVersion).toBe(WACC_ENGINE_VERSION);
    expect(result.methodologyVersion).toBe(WACC_METHODOLOGY_VERSION);
    expect(result.calculatedAt).toBe(AT);
    expect(result.inputSnapshot).toEqual(input());
    expect(result.steps).toHaveLength(7);
  });
});

describe("golden case 2 — solo equity, CRP omesso, tax 0%", () => {
  const result = computeWacc(
    input({
      riskFreeBp: 200,
      equityRiskPremiumBp: 600,
      countryRiskPremiumBp: 0,
      countryRiskPremiumOmitted: true,
      betaUnleveredMilli: 1200,
      creditSpreadBp: 300,
      taxRateBp: 0,
      debt: 0,
      equity: 1000,
    }),
    AT,
  );

  it("calcola WACC = Ke", () => {
    if (result.outcome !== "ok") throw new Error("atteso outcome ok");
    expect(result.breakdown.betaLeveredMilli).toBe(1200);
    expect(result.breakdown.costOfEquityBp).toBeCloseTo(920, 9);
    expect(result.breakdown.costOfDebtGrossBp).toBe(500);
    expect(result.breakdown.costOfDebtNetBp).toBe(500);
    expect(result.breakdown.equityWeight).toBe(1);
    expect(result.breakdown.debtWeight).toBe(0);
    expect(result.waccBp).toBeCloseTo(920, 9);
  });

  it("dichiara il CRP omesso come zero esplicito", () => {
    if (result.outcome !== "ok") throw new Error("atteso outcome ok");
    expect(result.breakdown.countryRiskPremiumBp).toBe(0);
    expect(result.breakdown.countryRiskPremiumOmitted).toBe(true);
    expect(result.warnings.some((w) => w.includes("rischio paese"))).toBe(true);
  });
});

describe("funzioni pure", () => {
  it("beta levered", () => {
    expect(betaLeveredMilli(1000, 1, 0)).toBe(1000);
    expect(betaLeveredMilli(1000, 0.7, 1)).toBeCloseTo(1700, 9);
  });

  it("Ke", () => {
    expect(costOfEquityBp(300, 1000, 500, 0)).toBe(800);
    expect(costOfEquityBp(300, 1500, 500, 100)).toBeCloseTo(1150, 9);
  });

  it("Kd lordo e netto", () => {
    expect(costOfDebtGrossBp(300, 250)).toBe(550);
    expect(costOfDebtNetBp(550, 0.75)).toBeCloseTo(412.5, 9);
  });
});

describe("casi limite e blocchi", () => {
  it("tax 100% annulla il costo del debito netto", () => {
    const result = computeWacc(input({ taxRateBp: 10000 }), AT);
    if (result.outcome !== "ok") throw new Error("atteso outcome ok");
    expect(result.breakdown.costOfDebtNetBp).toBe(0);
    expect(result.breakdown.betaLeveredMilli).toBe(900);
    expect(result.warnings.some((w) => w.includes("100%"))).toBe(true);
  });

  it("blocca equity nulla", () => {
    const result = computeWacc(input({ equity: 0 }), AT);
    expect(result.outcome).toBe("blocked");
    if (result.outcome !== "blocked") return;
    expect(result.errors.some((e) => e.code === "EQUITY_NOT_POSITIVE")).toBe(true);
  });

  it("blocca debito ed equity entrambi nulli", () => {
    const result = computeWacc(input({ debt: 0, equity: 0 }), AT);
    if (result.outcome !== "blocked") throw new Error("atteso blocco");
    expect(result.errors.map((e) => e.code)).toContain("CAPITAL_STRUCTURE_EMPTY");
  });

  it("blocca aliquote fuori dominio", () => {
    for (const taxRateBp of [-1, 10001]) {
      const result = computeWacc(input({ taxRateBp }), AT);
      if (result.outcome !== "blocked") throw new Error("atteso blocco");
      expect(result.errors.some((e) => e.code === "TAX_OUT_OF_RANGE")).toBe(true);
    }
  });

  it("blocca NaN e Infinity", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = computeWacc(input({ riskFreeBp: value }), AT);
      if (result.outcome !== "blocked") throw new Error("atteso blocco");
      expect(result.errors[0]?.code).toBe("NOT_FINITE");
    }
  });

  it("blocca valori negativi fuori dominio", () => {
    const result = computeWacc(input({ betaUnleveredMilli: -100, debt: -1 }), AT);
    if (result.outcome !== "blocked") throw new Error("atteso blocco");
    expect(result.errors.some((e) => e.code === "NEGATIVE_NOT_ALLOWED")).toBe(true);
  });
});

describe("validazione del modulo", () => {
  it("converte percentuali e beta nelle unità del motore", () => {
    const result = validateWaccInput(raw());
    if (!result.ok) throw new Error("atteso input valido");
    expect(result.input).toEqual(input());
  });

  it("tratta il CRP vuoto come zero esplicito", () => {
    const result = validateWaccInput(raw({ countryRiskPremiumPct: "" }));
    if (!result.ok) throw new Error("atteso input valido");
    expect(result.input.countryRiskPremiumBp).toBe(0);
    expect(result.input.countryRiskPremiumOmitted).toBe(true);
  });

  it("rifiuta testo, campi vuoti e valori fuori dominio", () => {
    const notNumber = validateWaccInput(raw({ riskFreePct: "tre" }));
    expect(notNumber.ok).toBe(false);
    const missing = validateWaccInput(raw({ equity: "" }));
    expect(missing.ok).toBe(false);
    const tax = validateWaccInput(raw({ taxRatePct: "120" }));
    expect(tax.ok).toBe(false);
    const equity = validateWaccInput(raw({ equity: "0" }));
    if (equity.ok) throw new Error("atteso blocco");
    expect(equity.errors.some((e) => e.field === "equity")).toBe(true);
  });

  it("rifiuta Infinity e NaN scritti come testo", () => {
    expect(validateWaccInput(raw({ debt: "Infinity" })).ok).toBe(false);
    expect(validateWaccInput(raw({ debt: "NaN" })).ok).toBe(false);
  });

  it("accetta debito zero con equity positiva", () => {
    const result = validateWaccInput(raw({ debt: "0" }));
    expect(result.ok).toBe(true);
  });
});

describe("formattazione (solo presentazione)", () => {
  it("formatta bp e beta", () => {
    expect(formatBpAsPercent(869.48)).toBe("8,69%");
    expect(formatBeta(1356)).toBe("1,356");
    expect(formatBpAsPercent(Number.NaN)).toBe("non disponibile");
  });
});
