import { getCountry } from "../countries";
import type { CompanyProfile, Financials } from "../types";
import { searchUrAccounting } from "./bilanci/ur-de";

export interface GermanyAdapterResult {
  ok: boolean;
  profile?: CompanyProfile;
  financials?: Financials;
  error?: string;
  skipped?: string;
}

export async function searchGermanyAdapter(
  input: { query?: string; localVat?: string },
  timeoutMs = 30000,
): Promise<GermanyAdapterResult> {
  const query = input.query?.trim() ?? "";
  const localVat = input.localVat?.trim() ?? "";
  const lookup = query || localVat;

  if (lookup.length < 3) {
    return { ok: false, error: "ragione sociale o identificativo troppo corto" };
  }

  const result = await searchUrAccounting(lookup, timeoutMs);
  if (!result.ok || !result.data) {
    if (result.skipped) return { ok: false, skipped: result.skipped };
    return { ok: false, error: result.error ?? "fonte non raggiungibile" };
  }

  const country = getCountry("DE");
  if (!country) return { ok: false, error: "paese DE non configurato" };

  const profile: CompanyProfile = {
    name: result.company?.name ?? lookup,
    nameSource: "resolver societario tedesco",
    country,
    registry: {
      name: country.registryName,
      authority: country.registryAuthority,
      ...(result.company?.euId ? { id: result.company.euId } : {}),
    },
  };

  return { ok: true, profile, financials: result.data };
}
