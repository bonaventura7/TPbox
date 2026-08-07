/**
 * Validazione deterministica degli input WACC.
 * Nessun fallback silenzioso: un campo non valido blocca il calcolo.
 */

import type { WaccError, WaccField, WaccInput } from "./model";

export interface RawWaccInput {
  readonly riskFreePct: string;
  readonly equityRiskPremiumPct: string;
  readonly countryRiskPremiumPct: string;
  readonly betaUnlevered: string;
  readonly creditSpreadPct: string;
  readonly taxRatePct: string;
  readonly debt: string;
  readonly equity: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly input: WaccInput }
  | { readonly ok: false; readonly errors: readonly WaccError[] };

const LABEL: Record<WaccField, string> = {
  riskFreeBp: "Tasso privo di rischio",
  equityRiskPremiumBp: "Premio per il rischio azionario",
  countryRiskPremiumBp: "Premio per il rischio paese",
  betaUnleveredMilli: "Beta unlevered",
  creditSpreadBp: "Spread creditizio",
  taxRateBp: "Aliquota fiscale",
  debt: "Debito finanziario",
  equity: "Equity",
};

/** Converte una stringa in numero finito. Accetta la virgola decimale italiana. */
export function parseDecimal(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return null;
  if (!/^-?\d*\.?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Verifica che un numero già tipizzato sia utilizzabile dal motore. */
export function isUsableNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function scaleToBp(value: number): number {
  return value * 100;
}

export function validateWaccInput(raw: RawWaccInput): ValidationResult {
  const errors: WaccError[] = [];

  const read = (
    field: WaccField,
    text: string,
  ): { readonly value: number | null; readonly empty: boolean } => {
    const empty = text.trim() === "";
    if (empty) return { value: null, empty: true };
    const value = parseDecimal(text);
    if (value === null) {
      errors.push({
        field,
        code: "NOT_A_NUMBER",
        message: `${LABEL[field]}: inserisci un numero valido (nessun testo, nessun valore infinito).`,
      });
      return { value: null, empty: false };
    }
    return { value, empty: false };
  };

  const required = (field: WaccField, text: string): number | null => {
    const parsed = read(field, text);
    if (parsed.empty) {
      errors.push({
        field,
        code: "REQUIRED",
        message: `${LABEL[field]}: campo obbligatorio.`,
      });
      return null;
    }
    return parsed.value;
  };

  const riskFree = required("riskFreeBp", raw.riskFreePct);
  const erp = required("equityRiskPremiumBp", raw.equityRiskPremiumPct);
  const beta = required("betaUnleveredMilli", raw.betaUnlevered);
  const spread = required("creditSpreadBp", raw.creditSpreadPct);
  const tax = required("taxRateBp", raw.taxRatePct);
  const debt = required("debt", raw.debt);
  const equity = required("equity", raw.equity);

  const crpRaw = read("countryRiskPremiumBp", raw.countryRiskPremiumPct);
  const crpOmitted = crpRaw.empty;
  const crp = crpOmitted ? 0 : crpRaw.value;

  const nonNegative = (field: WaccField, value: number | null): void => {
    if (value !== null && value < 0) {
      errors.push({
        field,
        code: "NEGATIVE_NOT_ALLOWED",
        message: `${LABEL[field]}: il valore non può essere negativo.`,
      });
    }
  };

  nonNegative("riskFreeBp", riskFree);
  nonNegative("equityRiskPremiumBp", erp);
  nonNegative("countryRiskPremiumBp", crp);
  nonNegative("betaUnleveredMilli", beta);
  nonNegative("creditSpreadBp", spread);
  nonNegative("debt", debt);

  if (tax !== null && (tax < 0 || tax > 100)) {
    errors.push({
      field: "taxRateBp",
      code: "TAX_OUT_OF_RANGE",
      message: "Aliquota fiscale: ammessi solo valori da 0% a 100%.",
    });
  }

  if (equity !== null && equity <= 0) {
    errors.push({
      field: "equity",
      code: "EQUITY_NOT_POSITIVE",
      message: "Equity: il valore deve essere maggiore di zero.",
    });
  }

  if (debt !== null && equity !== null && debt === 0 && equity === 0) {
    errors.push({
      field: "form",
      code: "CAPITAL_STRUCTURE_EMPTY",
      message:
        "Struttura finanziaria non definita: debito ed equity non possono essere entrambi zero.",
    });
  }

  if (
    errors.length > 0 ||
    riskFree === null ||
    erp === null ||
    crp === null ||
    beta === null ||
    spread === null ||
    tax === null ||
    debt === null ||
    equity === null
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    input: {
      riskFreeBp: scaleToBp(riskFree),
      equityRiskPremiumBp: scaleToBp(erp),
      countryRiskPremiumBp: scaleToBp(crp),
      betaUnleveredMilli: beta * 1000,
      creditSpreadBp: scaleToBp(spread),
      taxRateBp: scaleToBp(tax),
      debt,
      equity,
      countryRiskPremiumOmitted: crpOmitted,
    },
  };
}
