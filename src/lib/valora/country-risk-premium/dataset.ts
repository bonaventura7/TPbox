import type { CountryRiskPremiumDatasetManifest, CountryRiskPremiumRecord } from "./model";
import { COUNTRY_RISK_PREMIUM_DATASET_VERSION } from "./model";

/**
 * Empty by design: no CRP value is published until reuse rights, attribution,
 * source provenance and a versioned snapshot have been verified.
 */
export const COUNTRY_RISK_PREMIUM_RECORDS: readonly CountryRiskPremiumRecord[] = [];

export const COUNTRY_RISK_PREMIUM_MANIFEST: CountryRiskPremiumDatasetManifest = {
  version: COUNTRY_RISK_PREMIUM_DATASET_VERSION,
  generatedAt: "2026-08-07",
  recordCount: 0,
  checksum: null,
  sourceSnapshotVerified: false,
};
