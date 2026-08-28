// ---------- CVR — Danimarca: Virksomhedsregisteret (Erhvervsstyrelsen) ----------
// API aperta, gratuita, senza chiave. Il numero CVR coincide con le cifre del numero IVA DK.
// Endpoint: https://datacvr.virk.dk/api/v5/enriched/{cvr}
// Nota: il dominio è protetto da Cloudflare in alcuni ambienti: adapter best-effort.

import type { ActivityCode, CompanyProfile } from "../types";
import { getCountry } from "../countries";

export interface CvrResult {
  ok: boolean;
  data?: CompanyProfile | undefined;
  error?: string | undefined;
  notFound?: boolean | undefined;
}

export async function fetchCvr(cvrNumber: string, timeoutMs = 12000): Promise<CvrResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://datacvr.virk.dk/api/v5/enriched/${cvrNumber}`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (res.status === 404) {
      return { ok: false, notFound: true, error: `CVR ${cvrNumber} non trovato` };
    }
    if (res.status === 403) {
      return { ok: false, error: "CVR: accesso protetto (403)" };
    }
    if (!res.ok) return { ok: false, error: `CVR HTTP ${res.status}` };
    const j = await res.json();

    const industry: ActivityCode[] = Array.isArray(j.industry)
      ? j.industry
          .filter((i: { description?: string }) => i.description)
          .slice(0, 8)
          .map((i: { sic?: string | undefined; description?: string }) => ({
            code: i.sic ? String(i.sic) : "",
            label: i.description ? String(i.description).toLowerCase() : undefined,
          }))
      : [];

    const country = getCountry("DK")!;
    const profile: CompanyProfile = {
      name: typeof j.name === "string" ? j.name : undefined,
      nameSource: "CVR",
      country,
      registry: {
        name: "CVR — Virksomhedsregisteret",
        authority: "Erhvervsstyrelsen",
        id: `CVR ${cvrNumber}`,
      },
      legalForm: j.companyForm ? String(j.companyForm) : undefined,
      status: typeof j.status === "string" ? j.status.toLowerCase() : undefined,
      registeredSince: j.registrationDate ? String(j.registrationDate) : undefined,
      lastRegistryUpdate: j.lastRegistrationDate ? String(j.lastRegistrationDate) : undefined,
      address:
        j.street || j.postalCode
          ? [j.street, j.postalCode, j.municipality].filter(Boolean).join(", ").toLowerCase()
          : undefined,
      website: j.website ? String(j.website).toLowerCase() : undefined,
      activityCodes: industry,
    };
    return { ok: true, data: profile };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "CVR: errore di rete",
    };
  } finally {
    clearTimeout(timer);
  }
}
