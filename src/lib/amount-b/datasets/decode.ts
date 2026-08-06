/**
 * Amount B – Decodifica delle righe compatte dei dataset.
 */

import type {
  CapRatesApplicable,
  IncomeGroup,
  JurisdictionCategory,
  JurisdictionRecord,
  SovereignCreditRating,
} from "./types";

/**
 * Riga compatta: nome, indice del gruppo di reddito, categoria, flag "meno di
 * 5 comparabili", flag DAM, rating usato.
 */
export type JurisdictionRow = readonly [
  string,
  0 | 1 | 2 | 3,
  JurisdictionCategory,
  0 | 1,
  0 | 1,
  string,
];

const INCOME_GROUPS: readonly [IncomeGroup, IncomeGroup, IncomeGroup, IncomeGroup] = [
  "Low income",
  "Lower middle income",
  "Upper middle income",
  "High income",
];

/**
 * Fasce cap applicabili in funzione della categoria.
 * Riproduce la colonna D della data table OCSE.
 */
export function capRatesForCategory(category: JurisdictionCategory): CapRatesApplicable {
  return category === 2 ? "Alternative cap rates" : "Default cap rates";
}

export function decodeJurisdictions(
  rows: readonly JurisdictionRow[],
): readonly JurisdictionRecord[] {
  return rows.map(([jurisdiction, incomeGroupIndex, category, lessThanFive, dam, rating]) => ({
    jurisdiction,
    incomeGroup: INCOME_GROUPS[incomeGroupIndex],
    category,
    capRatesApplicable: capRatesForCategory(category),
    lessThanFiveComparables: lessThanFive === 1,
    damQualifying: dam === 1,
    creditRatingUsed: rating as SovereignCreditRating,
  }));
}
