/**
 * Amount B – Tipi dei dataset
 *
 * Fonte: OECD, "Pricing Automation Tool for the Simplified and Streamlined
 * Approach" (February 2026 version), fogli "Data Table as of ..." e
 * "3 Automated Calculations".
 *
 * I dataset sono versionati per data table. La matrice di pricing e le fasce
 * cap/collar appartengono invece alla versione del workbook, non della data
 * table, e vivono in `pricing-matrix.ts`.
 */

/** Gruppo di reddito Banca Mondiale usato nella data table OCSE. */
export type IncomeGroup =
  "Low income" | "Lower middle income" | "Upper middle income" | "High income";

/**
 * Categoria della giurisdizione ai fini delle fasce cap dell'Operating
 * Expense Cross-Check (Section 5.2).
 *
 * Category 1 -> "Default cap rates"; Category 2 -> "Alternative cap rates".
 * Derivazione: colonna D della data table,
 * `IFS(C="Category 2","Alternative cap rates",C="Category 1","Default cap rates")`.
 */
export type JurisdictionCategory = 1 | 2;

/** Fasce cap applicabili, derivate dalla categoria. */
export type CapRatesApplicable = "Default cap rates" | "Alternative cap rates";

/** Classificazione di factor intensity della matrice di pricing. */
export type FactorIntensity = "A" | "B" | "C" | "D" | "E";

/** Industry grouping della matrice di pricing. */
export type IndustryGrouping = 1 | 2 | 3;

/**
 * Rating sovrano usato ai fini della Section 5.3, nella tassonomia della
 * data table OCSE (che non coincide con le scale delle singole agenzie:
 * l'OCSE accorpa tutto ciò che è pari o superiore ad A- e tutto ciò che è
 * pari o inferiore a CCC-).
 */
export type SovereignCreditRating =
  | "-"
  | "A- or higher"
  | "BBB+"
  | "BBB"
  | "BBB-"
  | "BB+"
  | "BB"
  | "BB-"
  | "B+"
  | "B"
  | "B-"
  | "CCC+"
  | "CCC"
  | "CCC- or lower"
  | "No Credit Rating";

/** Record di una giurisdizione nella data table. */
export interface JurisdictionRecord {
  /** Denominazione OCSE della giurisdizione (chiave di lookup). */
  readonly jurisdiction: string;
  readonly incomeGroup: IncomeGroup;
  readonly category: JurisdictionCategory;
  /** Fasce cap applicabili ai fini della Section 5.2. */
  readonly capRatesApplicable: CapRatesApplicable;
  /**
   * Esito del test 1 della Section 5.3 (meno di 5 comparabili nel dataset
   * globale). Riportato per trasparenza: la qualificazione DAM effettiva è
   * `damQualifying`.
   */
  readonly lessThanFiveComparables: boolean;
  /** Giurisdizione qualificata ai fini del Data Availability Mechanism. */
  readonly damQualifying: boolean;
  /** Rating usato ai fini della Section 5.3. */
  readonly creditRatingUsed: SovereignCreditRating;
}

/** Voce della scala rating -> net risk adjustment. */
export interface CreditRatingBand {
  readonly rating: SovereignCreditRating;
  /** Net risk adjustment in forma decimale (0.012 = 1,2%). */
  readonly netRiskAdjustment: number;
}

/** Prodotto e relativo industry grouping. */
export interface ProductRecord {
  readonly product: string;
  readonly industryGrouping: IndustryGrouping;
}
