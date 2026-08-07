import { COUNTRY_RISK_PREMIUM_MANIFEST, COUNTRY_RISK_PREMIUM_RECORDS } from "./dataset";
import type { CountryRiskPremiumRecord } from "./model";

export type CountryRiskPremiumValidationCode =
  | "DUPLICATE_COUNTRY_CODE"
  | "INVALID_COUNTRY_CODE"
  | "INVALID_CRp"
  | "INVALID_SPREAD"
  | "SOURCE_ID_MISSING"
  | "SOURCE_VERSION_MISSING"
  | "VERIFICATION_MISSING"
  | "VERIFIED_RECORD_WITHOUT_SNAPSHOT";

export interface CountryRiskPremiumValidationFinding {
  readonly code: CountryRiskPremiumValidationCode;
  readonly countryCode: string;
  readonly message: string;
}

export interface CountryRiskPremiumValidationReport {
  readonly valid: boolean;
  readonly findings: readonly CountryRiskPremiumValidationFinding[];
}

function isFiniteNonNegative(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0);
}

export function validateCountryRiskPremiumRecord(
  record: CountryRiskPremiumRecord,
): readonly CountryRiskPremiumValidationFinding[] {
  const findings: CountryRiskPremiumValidationFinding[] = [];
  const countryCode = record.countryCode.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    findings.push({
      code: "INVALID_COUNTRY_CODE",
      countryCode,
      message: "Il codice Paese deve essere un codice ISO alpha-2.",
    });
  }
  if (!Number.isFinite(record.countryRiskPremiumBp) || record.countryRiskPremiumBp < 0) {
    findings.push({
      code: "INVALID_CRp",
      countryCode,
      message: "Il CRP deve essere finito e non negativo.",
    });
  }
  if (!isFiniteNonNegative(record.adjustedDefaultSpreadBp)) {
    findings.push({
      code: "INVALID_SPREAD",
      countryCode,
      message: "Lo spread rettificato deve essere finito e non negativo quando presente.",
    });
  }
  if (record.sourceId.trim().length === 0) {
    findings.push({
      code: "SOURCE_ID_MISSING",
      countryCode,
      message: "La fonte primaria deve essere identificata.",
    });
  }
  if (record.sourceVersion.trim().length === 0) {
    findings.push({
      code: "SOURCE_VERSION_MISSING",
      countryCode,
      message: "La versione della fonte deve essere dichiarata.",
    });
  }
  if (record.lastVerifiedAt.trim().length === 0) {
    findings.push({
      code: "VERIFICATION_MISSING",
      countryCode,
      message: "La data di verifica deve essere dichiarata.",
    });
  }
  if (record.status === "VERIFIED" && !COUNTRY_RISK_PREMIUM_MANIFEST.sourceSnapshotVerified) {
    findings.push({
      code: "VERIFIED_RECORD_WITHOUT_SNAPSHOT",
      countryCode,
      message: "Un record VERIFIED richiede uno snapshot della fonte verificato.",
    });
  }

  return findings;
}

export function validateCountryRiskPremiumDataset(
  records: readonly CountryRiskPremiumRecord[] = COUNTRY_RISK_PREMIUM_RECORDS,
): CountryRiskPremiumValidationReport {
  const findings: CountryRiskPremiumValidationFinding[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    const countryCode = record.countryCode.trim().toUpperCase();
    if (seen.has(countryCode)) {
      findings.push({
        code: "DUPLICATE_COUNTRY_CODE",
        countryCode,
        message: "Il dataset contiene codici Paese duplicati.",
      });
    }
    seen.add(countryCode);
    findings.push(...validateCountryRiskPremiumRecord(record));
  }

  return { valid: findings.length === 0, findings };
}

export function parseImportedCrpBp(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
