// ---------- Grecia: Γ.Ε.ΜΗ. OpenData API (anagrafica imprese) ----------
// Fonte ufficiale dell'anagrafica delle imprese greche, gratuita ma con
// autenticazione: l'accesso richiede un api_key rilasciato dalla Κ.Υ. ΓΕΜΗ
// (KEEE) dopo la compilazione del modulo di registrazione su
// https://opendata.businessportal.gr/register/ (Nome, Email, Scopo d'uso).
// L'approvazione avviene in 1–3 giorni lavorativi e la chiave arriva via
// email; va passata nell'header HTTP `api_key`. Per l'ambiente di
// documentazione Swagger la chiave di prova è `api-docs-key` (soggetta a
// limiti di chiamate per IP).
//
// Endpoint (Swagger/OpenAPI 2.0): https://opendata-api.businessportal.gr/api/opendata/v1
//   GET /companies            → ricerca per nome (min 3), ΑΦΜ (9 cifre) o Αρ. ΓΕΜΗ
//   GET /companies/{arGemi}   → scheda completa dell'impresa
//
// Il dataset espone i dati pubblici della μερίδα ΓΕΜΗ (l'equivalente del
// Registro Imprese): denominazione, ΑΦΜ, forma giuridica, stato, sede,
// capitale, attività (ΚΑΔ) e persone. I bilanci (Οικονομικές Καταστάσεις)
// NON sono in questo API: restano sul portale publicity.businessportal.gr.

import type { ActivityCode, CompanyProfile, Officer } from "../types";
import { getCountry } from "../countries";

export const GEMI_OPENDATA_BASE = "https://opendata-api.businessportal.gr/api/opendata/v1";
export const GEMI_OPENDATA_REGISTER = "https://opendata.businessportal.gr/register/";
export const GEMI_OPENDATA_KEY_ENV = "GEMI_API_KEY";
export const GEMI_TEST_KEY = "api-docs-key";

const DEFAULT_TIMEOUT_MS = 15_000;

/** Chiave API facoltativa, letta in modo difensivo (edge runtime senza `process`). */
export function gemiApiKey(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const value = env?.[GEMI_OPENDATA_KEY_ENV]?.trim();
  return value ? value : undefined;
}

// ---------- Normalizzazione degli identificativi ----------

/** Αρ. ΓΕΜΗ: 10 cifre (senza prefisso). */
export function gemiFromInput(value: string): string | undefined {
  const digits = value.replace(/\D/g, "");
  return /^\d{10}$/.test(digits) ? digits : undefined;
}

/** ΑΦΜ: 9 cifre. Accetta anche il prefisso IVA "EL" o il codice paese "GR". */
export function afmFromInput(value: string): string | undefined {
  const raw = value
    .trim()
    .toUpperCase()
    .replace(/^(EL|GR)/, "");
  const digits = raw.replace(/\D/g, "");
  return /^\d{9}$/.test(digits) ? digits : undefined;
}

// ---------- Modelli del payload (sottoinsieme dello Swagger) ----------

interface GemiNamedValue {
  id?: number | string | undefined;
  descr?: string | undefined;
  descrEn?: string | undefined;
}

interface GemiActivity {
  activity?: {
    id?: string | undefined;
    descr?: string | undefined;
    kadVersion?: string | undefined;
  };
  type?: string | undefined;
}

interface GemiPerson {
  personName?: string | undefined;
  businessName?: string | undefined;
  role?: string | undefined;
  dtFrom?: string | undefined;
}

export interface GemiCompany {
  arGemi?: number | undefined;
  afm?: string | undefined;
  coNameEl?: string | undefined;
  coNamesEn?: string[] | undefined;
  coTitlesEl?: string[] | undefined;
  coTitlesEn?: string[] | undefined;
  city?: string | undefined;
  street?: string | undefined;
  streetNumber?: string | undefined;
  zipCode?: string | undefined;
  poBox?: string | undefined;
  url?: string | undefined;
  email?: string | undefined;
  isBranch?: boolean | undefined;
  objective?: string | undefined;
  legalType?: GemiNamedValue | undefined;
  gemiOffice?: GemiNamedValue | undefined;
  incorporationDate?: string | undefined;
  lastStatusChange?: string | undefined;
  status?: (GemiNamedValue & { isActive?: boolean | undefined }) | undefined;
  autoRegistered?: boolean | undefined;
  activities?: GemiActivity[] | undefined;
  persons?: GemiPerson[] | undefined;
  capital?: Array<{ capitalStock?: number | undefined; currency?: string | undefined }> | undefined;
}

interface GemiSearchResponse {
  searchMetadata?: {
    totalCount?: number | undefined;
    resultsOffset?: number | undefined;
    resultsSize?: string | number | undefined;
  };
  searchResults?: GemiCompany[] | undefined;
}

export interface GemiProfileResult {
  ok: boolean;
  data?: CompanyProfile | undefined;
  /** Ricerca eseguita senza corrispondenze (esito legittimo, non errore). */
  notFound?: boolean | undefined;
  /** Fonte non consultata (chiave assente o input insufficiente). */
  skipped?: string | undefined;
  error?: string | undefined;
}

class GemiHttpError extends Error {
  constructor(readonly status: number) {
    super(`GEMI OpenData HTTP ${status}`);
    this.name = "GemiHttpError";
  }
}

function textOr(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// ---------- Mapping payload → scheda società ----------

export function gemiCompanyToProfile(company: GemiCompany): CompanyProfile {
  const country = getCountry("GR");
  if (!country) throw new Error("Grecia assente dal catalogo paesi");

  const name = textOr(company.coNameEl) ?? textOr(company.coNamesEn?.[0]);
  const street = [company.street, company.streetNumber].filter(textOr).join(" ");
  const address = [street, company.zipCode, company.city].filter(textOr).join(", ");
  const capital = company.capital?.find((c) => typeof c?.capitalStock === "number");
  const statusDescr = textOr(company.status?.descrEn) ?? textOr(company.status?.descr);
  const status =
    company.status?.isActive === true
      ? "Attiva"
      : company.status?.isActive === false
        ? "Non attiva"
        : statusDescr;

  const identifiers = [
    ...(company.arGemi != null ? [{ key: "Αρ. Γ.Ε.ΜΗ.", value: String(company.arGemi) }] : []),
    ...(company.afm ? [{ key: "ΑΦΜ", value: company.afm }] : []),
  ];

  const activityCodes: ActivityCode[] = [];
  for (const activity of company.activities ?? []) {
    const code = textOr(activity.activity?.id);
    if (!code) continue;
    activityCodes.push({ code, label: textOr(activity.activity?.descr) });
  }

  const officers: Officer[] = (company.persons ?? [])
    .map((person) => {
      const name = textOr(person.personName) ?? textOr(person.businessName);
      const role = textOr(person.role);
      if (!name && !role) return undefined;
      return { role: role ?? "Persona", name, since: textOr(person.dtFrom) } as Officer;
    })
    .filter((o): o is Officer => Boolean(o));

  return {
    name,
    nameSource: "GEMI OpenData (Γ.Ε.ΜΗ.)",
    vat: company.afm ? { number: `EL${company.afm}`, country: "GR", valid: null } : undefined,
    country,
    registry: {
      name: country.registryName,
      authority: country.registryAuthority,
      ...(company.arGemi != null ? { id: String(company.arGemi) } : {}),
    },
    legalForm: textOr(company.legalType?.descrEn) ?? textOr(company.legalType?.descr),
    status,
    statusRaw: statusDescr,
    registeredSince: textOr(company.incorporationDate),
    lastRegistryUpdate: textOr(company.lastStatusChange),
    address: address || undefined,
    website: textOr(company.url),
    email: textOr(company.email),
    capital: capital
      ? [String(capital.capitalStock), capital.currency].filter(textOr).join(" ")
      : undefined,
    activityCodes: activityCodes.length ? activityCodes : undefined,
    officers: officers.length ? officers : undefined,
    identifiers,
  };
}

// ---------- Chiamate all'API ----------

async function gemiFetch<T>(
  pathWithQuery: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(`${GEMI_OPENDATA_BASE}${pathWithQuery}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      api_key: apiKey,
      "User-Agent": "TPBox-Company-Finder/1.0",
    },
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new GemiHttpError(response.status);
  return (await response.json()) as T;
}

/** Scheda completa per Αρ. ΓΕΜΗ; `undefined` se la società non esiste (404). */
export async function getGemiCompany(
  arGemi: number | string,
  apiKey: string,
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<GemiCompany | undefined> {
  const id = String(arGemi).replace(/\D/g, "");
  if (!/^\d{1,12}$/.test(id)) return undefined;

  const own = signal ? null : new AbortController();
  const effective = signal ?? own!.signal;
  const timer = own ? setTimeout(() => own.abort(), timeoutMs) : null;
  try {
    return await gemiFetch<GemiCompany>(`/companies/${id}`, apiKey, effective);
  } catch (error) {
    if (error instanceof GemiHttpError && error.status === 404) return undefined;
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Ricerca anagrafica: per Αρ. ΓΕΜΗ (10 cifre), ΑΦΜ (9 cifre) o denominazione.
 * La ricerca per identificativo è univoca; per denominazione si prende la
 * prima corrispondenza (ordinamento per data di costituzione decrescente).
 */
export async function searchGemiProfile(
  query: string,
  localVat: string,
  apiKey: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<GemiProfileResult> {
  const name = query.trim();
  const gemi = gemiFromInput(localVat) ?? gemiFromInput(name);
  const afm = afmFromInput(localVat) ?? afmFromInput(name);

  let params: URLSearchParams;
  if (gemi) {
    params = new URLSearchParams({ arGemi: gemi, resultsSize: "5" });
  } else if (afm) {
    params = new URLSearchParams({ afm, resultsSize: "5" });
  } else if (name.length >= 3) {
    params = new URLSearchParams({ name, resultsSize: "10", resultsSortBy: "-incorporationDate" });
  } else {
    return {
      ok: false,
      skipped: "servi la denominazione, l'ΑΦΜ (9 cifre) o il numero ΓΕΜΗ (10 cifre)",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const payload = await gemiFetch<GemiSearchResponse>(
      `/companies?${params.toString()}`,
      apiKey,
      controller.signal,
    );
    const results = (payload.searchResults ?? []).filter(
      (c): c is GemiCompany => Boolean(c) && typeof c === "object",
    );
    if (results.length === 0) return { ok: false, notFound: true };

    const first = results[0];
    if (!first) return { ok: false, notFound: true };

    // La ricerca per identificativo ritorna già la scheda completa; se invece
    // l'esito è una sintesi (solo arGemi), si recupera la scheda completa.
    const company =
      first.coNameEl || first.afm || first.legalType || first.status
        ? first
        : first.arGemi != null
          ? ((await getGemiCompany(first.arGemi, apiKey, controller.signal).catch(
              () => undefined,
            )) ?? first)
          : first;

    return { ok: true, data: gemiCompanyToProfile(company) };
  } catch (error) {
    const err = error as { name?: string | undefined; message?: string | undefined };
    if (err?.name === "AbortError") return { ok: false, error: "ΓΕΜΗ OpenData: timeout" };
    return { ok: false, error: err?.message ?? "ΓΕΜΗ OpenData non raggiungibile" };
  } finally {
    clearTimeout(timer);
  }
}
