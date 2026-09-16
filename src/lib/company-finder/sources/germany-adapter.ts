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

  const r = await searchUrAccounting(lookup, timeoutMs);
  if (r.ok && r.data) {
    const country = getCountry("DE");
    if (!country) return { ok: false, error: "paese DE non configurato" };

    const resolvedName = r.company?.name ?? lookup;
    const euId = r.company?.euId;
    const profile: CompanyProfile = {
      name: resolvedName,
      nameSource: "resolver societario tedesco",
      country,
      registry: {
        name: country.registryName,
        authority: country.registryAuthority,
        ...(euId ? { id: euId } : {}),
      },
    };

    return { ok: true, profile, financials: r.data };
  }

  if (r.skipped) return { ok: false, skipped: r.skipped };
  return { ok: false, error: r.error ?? "fonte non raggiungibile" };
}
