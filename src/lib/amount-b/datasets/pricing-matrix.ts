/**
 * Amount B – Matrice di pricing e fasce cap/collar
 *
 * Fonte: OECD, "Pricing Automation Tool for the Simplified and Streamlined
 * Approach" (February 2026 version), foglio "3 Automated Calculations",
 * intervalli I52:N59 (matrice Section 5.1) e I82:N87 (cap e collar
 * Section 5.2).
 *
 * Questi valori appartengono alla versione del workbook, non alla versione
 * della data table: sono quindi versionati separatamente dalle giurisdizioni.
 */

import type { FactorIntensity, IndustryGrouping } from "./types";
import type { OeccBand } from "./reference-tables";

/** Versione del workbook da cui provengono matrice e fasce. */
export const PRICING_MATRIX_VERSION = "2026-02";

/**
 * Return on sales della Section 5.1, per factor intensity e industry
 * grouping. Valori in forma decimale (0.025 = 2,50%).
 */
export const PRICING_MATRIX: Readonly<
  Record<FactorIntensity, Readonly<Record<IndustryGrouping, number>>>
> = {
  A: { 1: 0.035, 2: 0.05, 3: 0.055 },
  B: { 1: 0.03, 2: 0.0375, 3: 0.045 },
  C: { 1: 0.025, 2: 0.03, 3: 0.045 },
  D: { 1: 0.0175, 2: 0.02, 3: 0.03 },
  E: { 1: 0.015, 2: 0.0175, 3: 0.0225 },
};

/**
 * Semi-ampiezza della fascia accettabile intorno al return della matrice:
 * il risultato della Section 5.1 produce un intervallo pari al return
 * più o meno 0,5 punti percentuali.
 */
export const PRICING_BAND_HALF_WIDTH = 0.005;

/**
 * Soglie della classificazione di factor intensity.
 * A: OAS >= 45%. B: 30% <= OAS < 45%. C: 15% <= OAS < 30%.
 * D: OAS < 15% e OES >= 10%. E: OAS < 15% e OES < 10%.
 */
export const FACTOR_INTENSITY_THRESHOLDS = {
  oasA: 0.45,
  oasB: 0.3,
  oasC: 0.15,
  oesD: 0.1,
} as const;

/** Cap dell'Operating Expense Cross-Check, per fascia e regime di cap. */
export const OECC_CAPS: Readonly<
  Record<OeccBand, { readonly default: number; readonly alternative: number }>
> = {
  "High OAS": { default: 0.7, alternative: 0.8 },
  "Medium OAS": { default: 0.6, alternative: 0.7 },
  "Low OES": { default: 0.4, alternative: 0.45 },
};

/** Collar dell'Operating Expense Cross-Check, unico per tutte le fasce. */
export const OECC_COLLAR = 0.1;

/** Soglie fisse del calcolo. */
export const SCOPING_OES_LOWER_BOUND = 0.03;
/** Il limite superiore dell'OES è compreso tra il 20% e il 30% ed è scelto dalla giurisdizione. */
export const SCOPING_OES_UPPER_BOUND_RANGE = { min: 0.2, max: 0.3 } as const;
/** Soglia del guardrail sui debiti commerciali, in giorni. */
export const ACCOUNTS_PAYABLE_GUARDRAIL_DAYS = 90;
/** Cap dell'OAS ai fini della Section 5.3. */
export const DAM_OAS_CAP = 0.85;
/** Soglia de minimis per il multi-industry, sulle quote della seconda e terza categoria. */
export const MULTI_INDUSTRY_DE_MINIMIS = 0.2;
/** Giorni usati per la conversione dei debiti commerciali in giorni. */
export const DAYS_IN_YEAR = 365;
