/**
 * Modulo WACC: funzioni pure su input dimostrativi.
 * Tutti gli input sono espressi in punti base (bp) per evitare errori decimali,
 * come nel motore del ravvedimento.
 */

export const WACC_MODEL_VERSION = "wacc-model.v1";

export interface WaccInput {
  /** Tasso privo di rischio, in bp. */
  readonly riskFreeBp: number;
  /** Equity risk premium, in bp. */
  readonly equityRiskPremiumBp: number;
  /** Country risk premium, in bp. */
  readonly countryRiskPremiumBp: number;
  /** Beta unlevered di settore, in millesimi (1000 = 1,00). */
  readonly betaUnleveredMilli: number;
  /** Spread di credito, in bp. */
  readonly creditSpreadBp: number;
  /** Aliquota fiscale, in bp. */
  readonly taxRateBp: number;
  /** Debito, unità monetarie. */
  readonly debt: number;
  /** Equity, unità monetarie. */
  readonly equity: number;
}

export type WaccBlockedReason = "INVALID_INPUT";

export interface WaccBlocked {
  readonly status: "blocked";
  readonly reason: WaccBlockedReason;
  readonly message: string;
}

export interface WaccResult {
  readonly status: "ok";
  readonly modelVersion: string;
  readonly betaLeveredMilli: number;
  readonly costOfEquityBp: number;
  readonly costOfDebtBp: number;
  readonly afterTaxCostOfDebtBp: number;
  readonly equityWeightBp: number;
  readonly debtWeightBp: number;
  readonly waccBp: number;
  readonly steps: readonly { readonly label: string; readonly value: string }[];
}

export type WaccOutcome = WaccResult | WaccBlocked;

export function formatBp(bp: number): string {
  return `${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(bp / 100)}%`;
}

export function formatMilli(milli: number): string {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(milli / 1000);
}

export function betaLevered(
  betaUnleveredMilli: number,
  taxRateBp: number,
  debt: number,
  equity: number,
): number {
  if (equity <= 0) return betaUnleveredMilli;
  const leverage = debt / equity;
  return Math.round(betaUnleveredMilli * (1 + (1 - taxRateBp / 10_000) * leverage));
}

export function computeWacc(input: WaccInput): WaccOutcome {
  const values = [
    input.riskFreeBp,
    input.equityRiskPremiumBp,
    input.countryRiskPremiumBp,
    input.betaUnleveredMilli,
    input.creditSpreadBp,
    input.taxRateBp,
    input.debt,
    input.equity,
  ];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    return {
      status: "blocked",
      reason: "INVALID_INPUT",
      message: "Tutti i valori devono essere numeri finiti e non negativi.",
    };
  }
  if (input.taxRateBp > 10_000) {
    return {
      status: "blocked",
      reason: "INVALID_INPUT",
      message: "L'aliquota fiscale non può superare il 100%.",
    };
  }
  const capital = input.debt + input.equity;
  if (capital <= 0) {
    return {
      status: "blocked",
      reason: "INVALID_INPUT",
      message: "La somma di debito ed equity deve essere maggiore di zero.",
    };
  }

  const betaLeveredMilli = betaLevered(
    input.betaUnleveredMilli,
    input.taxRateBp,
    input.debt,
    input.equity,
  );
  const costOfEquityBp = Math.round(
    input.riskFreeBp +
      (betaLeveredMilli * input.equityRiskPremiumBp) / 1000 +
      input.countryRiskPremiumBp,
  );
  const costOfDebtBp = input.riskFreeBp + input.creditSpreadBp;
  const afterTaxCostOfDebtBp = Math.round((costOfDebtBp * (10_000 - input.taxRateBp)) / 10_000);
  const equityWeightBp = Math.round((input.equity / capital) * 10_000);
  const debtWeightBp = 10_000 - equityWeightBp;
  const waccBp = Math.round(
    (equityWeightBp * costOfEquityBp + debtWeightBp * afterTaxCostOfDebtBp) / 10_000,
  );

  return {
    status: "ok",
    modelVersion: WACC_MODEL_VERSION,
    betaLeveredMilli,
    costOfEquityBp,
    costOfDebtBp,
    afterTaxCostOfDebtBp,
    equityWeightBp,
    debtWeightBp,
    waccBp,
    steps: [
      { label: "Beta levered", value: formatMilli(betaLeveredMilli) },
      { label: "Costo dell'equity (Ke)", value: formatBp(costOfEquityBp) },
      { label: "Costo del debito lordo (Kd)", value: formatBp(costOfDebtBp) },
      { label: "Costo del debito netto d'imposta", value: formatBp(afterTaxCostOfDebtBp) },
      { label: "Peso dell'equity", value: formatBp(equityWeightBp) },
      { label: "Peso del debito", value: formatBp(debtWeightBp) },
    ],
  };
}
