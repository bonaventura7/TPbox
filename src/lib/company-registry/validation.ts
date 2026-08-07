import type { CompanyRegistrySource } from "./types";

export const EU_MEMBER_STATE_CODES = [
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
] as const;

export function validateCountryCode(countryCode: string): boolean {
  return EU_MEMBER_STATE_CODES.includes(countryCode.toUpperCase() as (typeof EU_MEMBER_STATE_CODES)[number]);
}

export function validateCompanyQuery(query: string): boolean {
  return query.trim().length >= 3 && query.trim().length <= 160;
}

function hostnameMatches(urlValue: string, expectedHost: string): boolean {
  try {
    const url = new URL(urlValue);
    return url.protocol === "https:" && url.hostname.toLowerCase() === expectedHost.toLowerCase();
  } catch {
    return false;
  }
}

export function validateVerifiedSource(source: CompanyRegistrySource): string[] {
  const errors: string[] = [];
  if (!validateCountryCode(source.country_code)) errors.push("INVALID_COUNTRY");
  if (!source.eu_member_state) errors.push("NOT_EU_MEMBER");
  if (source.status !== "VERIFIED") errors.push("NOT_VERIFIED");
  if (!hostnameMatches(source.official_register_url, source.official_register_host)) errors.push("REGISTER_HOST_MISMATCH");
  if (!hostnameMatches(source.official_information_url, source.official_information_host)) errors.push("INFO_HOST_MISMATCH");
  if (!source.official_register_name.trim()) errors.push("MISSING_REGISTER_NAME");
  if (!source.official_register_host.trim()) errors.push("MISSING_REGISTER_HOST");
  if (!source.official_information_host.trim()) errors.push("MISSING_INFO_HOST");
  return errors;
}

export function findDuplicateCountryCodes(sources: Pick<CompanyRegistrySource, "country_code">[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const source of sources) {
    const code = source.country_code.toUpperCase();
    if (seen.has(code)) duplicates.add(code);
    seen.add(code);
  }
  return [...duplicates];
}
