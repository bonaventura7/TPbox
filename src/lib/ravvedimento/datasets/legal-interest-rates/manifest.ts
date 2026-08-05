import { LEGAL_INTEREST_RATES_BP } from "./1997-2025";

export const LEGAL_INTEREST_DATASET_VERSION = "legal-interest-1997-2025.v1";

/** Ultimo giorno coperto dal dataset (ISO). Oltre questa data il calcolo va bloccato. */
export const LEGAL_INTEREST_COVERED_THROUGH = "2025-12-31";
export const LEGAL_INTEREST_COVERED_FROM = "1997-01-01";

export const legalInterestDataset = {
  version: LEGAL_INTEREST_DATASET_VERSION,
  coveredFrom: LEGAL_INTEREST_COVERED_FROM,
  coveredThrough: LEGAL_INTEREST_COVERED_THROUGH,
  source: "Decreti MEF - saggio legale art. 1284 c.c.",
  ratesBp: LEGAL_INTEREST_RATES_BP,
  rateBpForYear(year: number): number | null {
    const rate = LEGAL_INTEREST_RATES_BP[year];
    return typeof rate === "number" ? rate : null;
  },
} as const;