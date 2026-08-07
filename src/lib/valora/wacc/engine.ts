/**
 * Motore WACC: funzioni pure, nessun arrotondamento, nessuno stato,
 * nessun accesso a rete, filesystem o storage.
 */

import {
  WACC_ENGINE_VERSION,
  WACC_METHODOLOGY_VERSION,
  type WaccBlocked,
  type WaccBreakdown,
  type WaccError,
  type WaccInput,
  type WaccOk,
  type WaccOutcome,
  type WaccStep,
} from "./model";

/** Beta levered in millesimi: βL = βU × [1 + (1 − t) × D/E]. */
export function betaLeveredMilli(
  betaUnleveredMilli: number,
  taxShieldFactor: number,
  debtToEquity: number,
): number {
  return betaUnleveredMilli * (1 + taxShieldFactor * debtToEquity);
}

/** Ke in bp: rf + βL × ERP + CRP. */
export function costOfEquityBp(
  riskFreeBp: number,
  betaLeveredMilliValue: number,
  equityRiskPremiumBp: number,
  countryRiskPremiumBp: number,
): number {
  return riskFreeBp + (betaLeveredMilliValue / 1000) * equityRiskPremiumBp + countryRiskPremiumBp;
}

/** Kd lordo in bp: rf + spread. */
export function costOfDebtGrossBp(riskFreeBp: number, creditSpreadBp: number): number {
  return riskFreeBp + creditSpreadBp;
}

/** Kd netto in bp: Kd lordo × (1 − t). */
export function costOfDebtNetBp(grossBp: number, taxShieldFactor: number): number {
  return grossBp * taxShieldFactor;
}

function guard(input: WaccInput): readonly WaccError[] {
  const errors: WaccError[] = [];
  const numeric: readonly (readonly [keyof WaccInput, number])[] = [
    ["riskFreeBp", input.riskFreeBp],
    ["equityRiskPremiumBp", input.equityRiskPremiumBp],
    ["countryRiskPremiumBp", input.countryRiskPremiumBp],
    ["betaUnleveredMilli", input.betaUnleveredMilli],
    ["creditSpreadBp", input.creditSpreadBp],
    ["taxRateBp", input.taxRateBp],
    ["debt", input.debt],
    ["equity", input.equity],
  ];
  for (const [key, value] of numeric) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push({
        field: key as WaccError["field"],
        code: "NOT_FINITE",
        message: `${String(key)}: valore non numerico, NaN o infinito.`,
      });
    }
  }
  if (errors.length > 0) return errors;

  if (input.taxRateBp < 0 || input.taxRateBp > 10000) {
    errors.push({
      field: "taxRateBp",
      code: "TAX_OUT_OF_RANGE",
      message: "Aliquota fiscale fuori dominio: ammesso solo 0..10000 bp.",
    });
  }
  if (input.equity <= 0) {
    errors.push({
      field: "equity",
      code: "EQUITY_NOT_POSITIVE",
      message: "Equity deve essere maggiore di zero.",
    });
  }
  if (input.debt < 0) {
    errors.push({
      field: "debt",
      code: "NEGATIVE_NOT_ALLOWED",
      message: "Il debito non può essere negativo.",
    });
  }
  if (input.debt === 0 && input.equity === 0) {
    errors.push({
      field: "form",
      code: "CAPITAL_STRUCTURE_EMPTY",
      message: "Debito ed equity non possono essere entrambi zero.",
    });
  }
  for (const [key, value] of [
    ["riskFreeBp", input.riskFreeBp],
    ["equityRiskPremiumBp", input.equityRiskPremiumBp],
    ["countryRiskPremiumBp", input.countryRiskPremiumBp],
    ["betaUnleveredMilli", input.betaUnleveredMilli],
    ["creditSpreadBp", input.creditSpreadBp],
  ] as const) {
    if (value < 0) {
      errors.push({
        field: key as WaccError["field"],
        code: "NEGATIVE_NOT_ALLOWED",
        message: `${key}: il valore non può essere negativo.`,
      });
    }
  }
  return errors;
}

export function computeWacc(input: WaccInput, calculatedAt: string): WaccOutcome {
  const errors = guard(input);
  if (errors.length > 0) {
    const blocked: WaccBlocked = {
      outcome: "blocked",
      engineVersion: WACC_ENGINE_VERSION,
      methodologyVersion: WACC_METHODOLOGY_VERSION,
      calculatedAt,
      errors,
    };
    return blocked;
  }

  const taxShieldFactor = 1 - input.taxRateBp / 10000;
  const debtToEquity = input.debt / input.equity;
  const betaL = betaLeveredMilli(input.betaUnleveredMilli, taxShieldFactor, debtToEquity);
  const ke = costOfEquityBp(
    input.riskFreeBp,
    betaL,
    input.equityRiskPremiumBp,
    input.countryRiskPremiumBp,
  );
  const kdGross = costOfDebtGrossBp(input.riskFreeBp, input.creditSpreadBp);
  const kdNet = costOfDebtNetBp(kdGross, taxShieldFactor);
  const capital = input.debt + input.equity;
  const equityWeight = input.equity / capital;
  const debtWeight = input.debt / capital;
  const waccBp = equityWeight * ke + debtWeight * kdNet;

  const breakdown: WaccBreakdown = {
    betaLeveredMilli: betaL,
    costOfEquityBp: ke,
    costOfDebtGrossBp: kdGross,
    costOfDebtNetBp: kdNet,
    equityWeight,
    debtWeight,
    taxShieldFactor,
    debtToEquity,
    countryRiskPremiumBp: input.countryRiskPremiumBp,
    countryRiskPremiumOmitted: input.countryRiskPremiumOmitted,
  };

  const warnings: string[] = [];
  if (input.countryRiskPremiumOmitted) {
    warnings.push(
      "Premio per il rischio paese non inserito: nel calcolo è stato usato il valore esplicito 0.",
    );
  }
  if (input.debt === 0) {
    warnings.push("Debito pari a zero: il WACC coincide con il costo dell'equity unlevered.");
  }
  if (input.taxRateBp === 10000) {
    warnings.push("Aliquota fiscale al 100%: il costo del debito al netto delle imposte è nullo.");
  }

  const steps: readonly WaccStep[] = [
    {
      label: "Fattore di scudo fiscale",
      expression: `1 − t = 1 − ${input.taxRateBp / 10000}`,
      valueBp: null,
    },
    {
      label: "Beta levered",
      expression: `βL = βU × [1 + (1 − t) × D/E] = ${input.betaUnleveredMilli / 1000} × [1 + ${taxShieldFactor} × ${debtToEquity}]`,
      valueBp: null,
    },
    {
      label: "Costo dell'equity",
      expression: "Ke = rf + βL × ERP + CRP",
      valueBp: ke,
    },
    {
      label: "Costo del debito lordo",
      expression: "Kd lordo = rf + spread",
      valueBp: kdGross,
    },
    {
      label: "Costo del debito netto",
      expression: "Kd netto = Kd lordo × (1 − t)",
      valueBp: kdNet,
    },
    {
      label: "Pesi della struttura finanziaria",
      expression: "wE = E/(D+E); wD = D/(D+E)",
      valueBp: null,
    },
    {
      label: "WACC",
      expression: "WACC = wE × Ke + wD × Kd netto",
      valueBp: waccBp,
    },
  ];

  const ok: WaccOk = {
    outcome: "ok",
    engineVersion: WACC_ENGINE_VERSION,
    methodologyVersion: WACC_METHODOLOGY_VERSION,
    calculatedAt,
    inputSnapshot: input,
    breakdown,
    waccBp,
    warnings,
    steps,
  };
  return ok;
}
