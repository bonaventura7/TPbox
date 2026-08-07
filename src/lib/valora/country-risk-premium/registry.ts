import { COUNTRY_RISK_PREMIUM_RECORDS } from "./dataset";
import type { CountryRiskPremiumRecord } from "./model";

/** Pure local registry. It never reads from a remote source. */
export function getCountryRiskPremium(countryCode: string): CountryRiskPremiumRecord | null {
  const normalizedCode = countryCode.trim().toUpperCase();
  return (
    COUNTRY_RISK_PREMIUM_RECORDS.find((record) => record.countryCode === normalizedCode) ?? null
  );
}

export function listCountryRiskPremiums(): readonly CountryRiskPremiumRecord[] {
  return COUNTRY_RISK_PREMIUM_RECORDS;
}
