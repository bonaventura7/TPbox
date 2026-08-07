import { COUNTRY_RISK_PREMIUM_RECORDS } from "./dataset";
import type { CountryRiskPremiumRecord } from "./model";

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("it-IT");
}

export function searchCountryRiskPremiums(
  query: string,
  records: readonly CountryRiskPremiumRecord[] = COUNTRY_RISK_PREMIUM_RECORDS,
): readonly CountryRiskPremiumRecord[] {
  const normalizedQuery = normalizeForSearch(query);
  if (normalizedQuery.length === 0) return records;

  return records.filter((record) => {
    const searchable = [record.countryCode, record.countryNameIt, record.countryNameSource]
      .map(normalizeForSearch)
      .join(" ");
    return searchable.includes(normalizedQuery);
  });
}

export function selectVerifiedCountryRiskPremium(
  countryCode: string,
  records: readonly CountryRiskPremiumRecord[] = COUNTRY_RISK_PREMIUM_RECORDS,
): CountryRiskPremiumRecord | null {
  const normalizedCode = countryCode.trim().toUpperCase();
  return (
    records.find(
      (record) => record.countryCode === normalizedCode && record.status === "VERIFIED",
    ) ?? null
  );
}
