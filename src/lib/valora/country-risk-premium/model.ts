/**
 * Valora Country Risk Premium V1 — dominio locale e versionato.
 * Nessuna rete, persistenza o dipendenza React.
 */

export const COUNTRY_RISK_PREMIUM_DATASET_VERSION = "crp.v1-empty" as const;

export type CountryRiskPremiumStatus = "VERIFIED" | "STALE" | "UNAVAILABLE";

export interface CountryRiskPremiumRecord {
  readonly countryCode: string;
  readonly countryNameIt: string;
  readonly countryNameSource: string;
  readonly countryRiskPremiumBp: number;
  readonly adjustedDefaultSpreadBp: number | null;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly dataAsOf: string | null;
  readonly lastVerifiedAt: string;
  readonly status: CountryRiskPremiumStatus;
  readonly checksum: string | null;
}

export type CountryRiskPremiumOutcome =
  | {
      readonly status: "available";
      readonly record: CountryRiskPremiumRecord;
    }
  | {
      readonly status: "empty";
      readonly reason: "COUNTRY_NOT_FOUND" | "NO_VERIFIED_RECORD";
    };

export interface CountryRiskPremiumDatasetManifest {
  readonly version: string;
  readonly generatedAt: string;
  readonly recordCount: number;
  readonly checksum: string | null;
  readonly sourceSnapshotVerified: boolean;
}
