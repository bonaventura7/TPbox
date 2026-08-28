// ---------- OpenCorporates — aggregatore globale (~260 registri) ----------
// Chiave gratuita: https://opencorporates.com/developer (variabile OPEN_CORPORATES_API_KEY)
// Usi: ricerca per nome in qualsiasi giurisdizione; riscontro di dati societari
// (forma giuridica, capitale, stato, indirizzo, ufficiali) dove i registri
// nazionali non espongono API gratuite.

import type { ActivityCode, CompanyProfile, Identifier, Officer } from "../types";
import { getCountry } from "../countries";

const BASE = "https://api.opencorporates.com/v0.4";

export interface OcResult {
  ok: boolean;
  data?: CompanyProfile | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

function mapCompany(c: Record<string, unknown>): CompanyProfile | null {
  if (!c || typeof c !== "object") return null;
  const iso = String(c["jurisdiction_code"] || "").toUpperCase();
  const country = getCountry(iso) || {
    iso,
    nameIt: iso,
    flag: "🏳️",
    vatPrefix: iso,
    registryName: "Registro locale",
    registryAuthority: "",
    financials: { free: false, note: "" },
  };
  const ra = (c["registered_address"] || {}) as Record<string, unknown>;
  const addrParts = [
    ra["premises"],
    ra["address_line_1"],
    ra["address_locality"],
    ra["postal_code"],
    ra["region"],
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase())
    .join(", ");

  const identifiers: Identifier[] = [];
  if (c["vat_number"]) identifiers.push({ key: "VAT", value: String(c["vat_number"]) });

  const officers: Officer[] = [];
  const data = (c["data"] || {}) as Record<string, unknown>;
  const keyPeople = data["key_people"] as Record<string, unknown> | undefined;
  if (keyPeople) {
    for (const [role, persons] of Object.entries(keyPeople)) {
      for (const p of (Array.isArray(persons) ? persons : [persons]) as Record<string, unknown>[]) {
        const nm = p?.["name"] || p?.["given_name"] || p?.["surname"];
        if (nm) officers.push({ role, name: String(nm) });
      }
    }
  }

  const activityCodes: ActivityCode[] = [];
  const sic = data["nace_code"] || data["sic_code"];
  if (sic)
    activityCodes.push({
      code: String(sic),
      label: data["nace_code"] ? "codice NACE" : "codice SIC",
    });

  const capital = data["total_shares"] || data["share_capital"] || data["capital"];

  const profile: CompanyProfile = {
    name: typeof c["name"] === "string" ? c["name"] : undefined,
    nameSource: "OpenCorporates",
    country,
    registry: {
      name: country.registryName,
      authority: country.registryAuthority,
      // exactOptionalPropertyTypes: id omesso quando manca il company_number.
      ...(c["company_number"] ? { id: `${iso} · ${c["company_number"]}` } : {}),
    },
    legalForm: c["company_type"] ? String(c["company_type"]).toLowerCase() : undefined,
    status: c["company_status"] ? String(c["company_status"]).toLowerCase() : undefined,
    registeredSince: c["incorporation_date"] ? String(c["incorporation_date"]) : undefined,
    address: addrParts || undefined,
    capital: capital != null ? String(capital) : undefined,
    activityCodes,
    officers: officers.slice(0, 8),
    identifiers,
  };
  return profile;
}

/** Ricerca per nome (eventualmente limitata a una giurisdizione ISO2). */
export async function searchByName(
  name: string,
  jurisdiction?: string,
  apiKey?: string,
  timeoutMs = 12000,
): Promise<OcResult> {
  if (!apiKey) return { ok: false, skipped: "chiave OpenCorporates non configurata" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({
      q: name,
      per_page: "5",
      api_token: apiKey,
    });
    if (jurisdiction) params.set("jurisdiction_code", jurisdiction.toLowerCase());
    const res = await fetch(`${BASE}/companies/search?${params}`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (res.status === 401) return { ok: false, error: "OpenCorporates: chiave non valida" };
    if (!res.ok) return { ok: false, error: `OpenCorporates HTTP ${res.status}` };
    const json = await res.json();
    const companies = json?.results?.companies as
      Array<{ company: Record<string, unknown> }> | undefined;
    const first = companies?.[0];
    if (!first) {
      return { ok: false, error: "OpenCorporates: nessuna corrispondenza" };
    }
    const profile = mapCompany(first.company);
    return profile
      ? { ok: true, data: profile }
      : { ok: false, error: "OpenCorporates: dati non mappabili" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "OpenCorporates: errore di rete" };
  } finally {
    clearTimeout(timer);
  }
}
