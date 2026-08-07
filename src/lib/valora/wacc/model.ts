/**
 * Valora WACC — contratti del motore.
 * Convenzioni: tassi, premi e spread in basis point (1% = 100 bp);
 * beta in millesimi (1,000 = beta 1.00). Debito ed equity nella stessa unità
 * monetaria scelta dall'utente: il motore non converte nulla.
 * Nessun dato di mercato è precompilato: ogni valore è inserito manualmente.
 */

export const WACC_ENGINE_VERSION = "valora-wacc-engine.v1";
export const WACC_METHODOLOGY_VERSION = "valora-wacc-methodology.v1";

/** Campi del modulo, usati anche per associare gli errori ai controlli. */
export type WaccField =
  | "riskFreeBp"
  | "equityRiskPremiumBp"
  | "countryRiskPremiumBp"
  | "betaUnleveredMilli"
  | "creditSpreadBp"
  | "taxRateBp"
  | "debt"
  | "equity";

export interface WaccInput {
  /** Tasso privo di rischio, in bp. */
  readonly riskFreeBp: number;
  /** Premio per il rischio azionario, in bp. */
  readonly equityRiskPremiumBp: number;
  /** Premio per il rischio paese, in bp. Se omesso dall'utente vale 0 esplicito. */
  readonly countryRiskPremiumBp: number;
  /** Beta unlevered in millesimi. */
  readonly betaUnleveredMilli: number;
  /** Spread creditizio, in bp. */
  readonly creditSpreadBp: number;
  /** Aliquota fiscale in bp: 0..10000. */
  readonly taxRateBp: number;
  /** Debito finanziario, >= 0. */
  readonly debt: number;
  /** Equity, > 0. */
  readonly equity: number;
  /** true quando l'utente non ha compilato il campo CRP: il valore resta 0. */
  readonly countryRiskPremiumOmitted: boolean;
}

export interface WaccStep {
  readonly label: string;
  readonly expression: string;
  readonly valueBp: number | null;
}

export interface WaccBreakdown {
  readonly betaLeveredMilli: number;
  readonly costOfEquityBp: number;
  readonly costOfDebtGrossBp: number;
  readonly costOfDebtNetBp: number;
  readonly equityWeight: number;
  readonly debtWeight: number;
  readonly taxShieldFactor: number;
  readonly debtToEquity: number;
  readonly countryRiskPremiumBp: number;
  readonly countryRiskPremiumOmitted: boolean;
}

export interface WaccOk {
  readonly outcome: "ok";
  readonly engineVersion: string;
  readonly methodologyVersion: string;
  readonly calculatedAt: string;
  readonly inputSnapshot: WaccInput;
  readonly breakdown: WaccBreakdown;
  readonly waccBp: number;
  readonly warnings: readonly string[];
  readonly steps: readonly WaccStep[];
}

export interface WaccBlocked {
  readonly outcome: "blocked";
  readonly engineVersion: string;
  readonly methodologyVersion: string;
  readonly calculatedAt: string;
  readonly errors: readonly WaccError[];
}

export interface WaccError {
  readonly field: WaccField | "form";
  readonly code: string;
  readonly message: string;
}

export type WaccOutcome = WaccOk | WaccBlocked;
