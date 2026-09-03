// ---------- ΓΕΜΗ Open Data API — canale ufficiale greco ----------
//
// API aperta e documentata del Registro generale del commercio (ΓΕΜΗ),
// gestita da KEEE/UHC per il Ministero dello Sviluppo greco.
//
//   Swagger   : https://opendata-api.businessportal.gr/opendata/docs/
//   OpenAPI   : https://opendata-api.businessportal.gr/api-docs
//   Doc       : https://opendata.businessportal.gr/techdocs/
//   Licenza   : ODC-BY-1.0 (riuso consentito con attribuzione)
//
//   GET /companies?afm=|name=|arGemi=        ricerca (almeno un criterio)
//   GET /companies/{arGemi}                   scheda società
//   GET /companies/{arGemi}/documents         documenti pubblici
//   GET /downloadFile?key=<key>&elementId=<n> file binario (attachment)
//
// Autenticazione: header `api_key` (securityDefinitions in OpenAPI). La chiave
// è GRATUITA, si richiede su https://opendata.businessportal.gr/register/.
//
// Perché questo modulo e non lo scraping del portale publicity.businessportal.gr:
// la ricerca di quel portale è protetta da reCAPTCHA e non va aggirata. Qui
// invece usiamo il canale che il registro mette a disposizione dei terzi.

const ENV: Record<string, string | undefined> =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

export const GEMI_OPENDATA_BASE = "https://opendata-api.businessportal.gr/api/opendata/v1";

const TIMEOUT_MS = 12_000;
const UA = "TPbox-OsservatorioTransferPricing/1.0 (company-finder; +https://t-pbox.vercel.app)";

/** Chiave API ΓΕΜΗ: facoltativa, letta a ogni chiamata (test e hot reload). */
export function gemiApiKey(): string | undefined {
  const key = ENV["GEMI_API_KEY"]?.trim();
  return key ? key : undefined;
}

export type GemiApiState =
  "OK" | "NO_KEY" | "UNAUTHORIZED" | "NOT_FOUND" | "RATE_LIMITED" | "SOURCE_UNAVAILABLE";

export interface GemiApiResult<T> {
  ok: boolean;
  data?: T | undefined;
  state: GemiApiState;
  detail?: string | undefined;
}

function fail<T>(state: GemiApiState, detail?: string): GemiApiResult<T> {
  return detail === undefined ? { ok: false, state } : { ok: false, state, detail };
}

/** Chiave richiesta dall'API: header `api_key`. */
export function gemiAuthHeaders(key: string): Record<string, string> {
  return { api_key: key, Accept: "application/json", "User-Agent": UA };
}

async function getJson(
  path: string,
  key: string,
  signal?: AbortSignal,
): Promise<GemiApiResult<unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch(`${GEMI_OPENDATA_BASE}${path}`, {
      headers: gemiAuthHeaders(key),
      redirect: "follow",
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403)
      return fail("UNAUTHORIZED", `HTTP ${response.status}`);
    if (response.status === 404) return fail("NOT_FOUND", "nessun record");
    if (response.status === 429) return fail("RATE_LIMITED", "quota della chiave esaurita");
    if (!response.ok) return fail("SOURCE_UNAVAILABLE", `HTTP ${response.status}`);

    const text = await response.text();
    try {
      return { ok: true, data: JSON.parse(text) as unknown, state: "OK" };
    } catch {
      return fail("SOURCE_UNAVAILABLE", "risposta non JSON");
    }
  } catch (error) {
    const err = error as { name?: string; message?: string };
    return fail(
      "SOURCE_UNAVAILABLE",
      err?.name === "AbortError" ? "timeout" : (err?.message ?? "errore di rete"),
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export interface GemiCompanySummary {
  arGemi: string;
  afm?: string | undefined;
  nameEl?: string | undefined;
  namesEn?: string[] | undefined;
  legalType?: string | undefined;
  status?: string | undefined;
  isActive?: boolean | undefined;
  incorporationDate?: string | undefined;
  city?: string | undefined;
  street?: string | undefined;
  streetNumber?: string | undefined;
  zipCode?: string | undefined;
  website?: string | undefined;
  email?: string | undefined;
  capital?: string | undefined;
  currency?: string | undefined;
}

type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Dict)
    : undefined;
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asDigits(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === "string") {
    const digits = value.replace(/\D/g, "");
    return digits ? digits : undefined;
  }
  return undefined;
}

/** Mappa un record `Company` dell'API ΓΕΜΗ sul profilo sintetico del tool. */
export function mapGemiCompany(raw: unknown): GemiCompanySummary | undefined {
  const company = asDict(raw);
  if (!company) return undefined;
  const arGemi = asDigits(company["arGemi"]);
  if (!arGemi) return undefined;

  const namesEn = Array.isArray(company["coNamesEn"])
    ? company["coNamesEn"].map(asText).filter((v): v is string => Boolean(v))
    : [];
  const capital = Array.isArray(company["capital"]) ? asDict(company["capital"][0]) : undefined;

  const summary: GemiCompanySummary = { arGemi };
  const afm = asText(company["afm"]);
  const nameEl = asText(company["coNameEl"]);
  const legalType = asText(asDict(company["legalType"])?.["descr"]);
  const status = asDict(company["status"]);
  const city = asText(company["city"]);
  const street = asText(company["street"]);
  const streetNumber = asText(company["streetNumber"]);
  const zipCode = asText(company["zipCode"]);
  const website = asText(company["url"]);
  const email = asText(company["email"]);
  const incorporationDate = asText(company["incorporationDate"]);
  const capitalStock = asDict(capital?.["capitalStock"] ?? undefined) ?? capital;
  const currency = asText(capital?.["currency"]);

  if (afm) summary.afm = afm;
  if (nameEl) summary.nameEl = nameEl;
  if (namesEn.length) summary.namesEn = namesEn;
  if (legalType) summary.legalType = legalType;
  if (status) {
    const descr = asText(status["descr"]);
    if (descr) summary.status = descr;
    if (typeof status["isActive"] === "boolean") summary.isActive = status["isActive"] as boolean;
  }
  if (incorporationDate) summary.incorporationDate = incorporationDate;
  if (city) summary.city = city;
  if (street) summary.street = street;
  if (streetNumber) summary.streetNumber = streetNumber;
  if (zipCode) summary.zipCode = zipCode;
  if (website) summary.website = website;
  if (email) summary.email = email;
  const stock = asText(capitalStock?.["capitalStock"] ?? capital?.["capitalStock"]);
  if (stock) summary.capital = stock;
  if (currency) summary.currency = currency;
  return summary;
}

export interface GemiSearchCriteria {
  arGemi?: string | undefined;
  afm?: string | undefined;
  name?: string | undefined;
}

/** Ricerca per ΑΦΜ / ΓΕΜΗ / denominazione: è il canale che risolve IVA → ΓΕΜΗ. */
export async function searchGemiCompanies(
  criteria: GemiSearchCriteria,
  signal?: AbortSignal,
): Promise<GemiApiResult<GemiCompanySummary[]>> {
  const key = gemiApiKey();
  if (!key) return fail("NO_KEY", "GEMI_API_KEY non configurata");

  const params = new URLSearchParams();
  if (criteria.arGemi) params.set("arGemi", criteria.arGemi);
  if (criteria.afm) params.set("afm", criteria.afm.padStart(9, "0"));
  if (criteria.name) params.set("name", criteria.name);
  params.set("resultsSize", "10");
  if ([...params.keys()].length === 1) return fail("NOT_FOUND", "nessun criterio di ricerca");

  const result = await getJson(`/companies?${params.toString()}`, key, signal);
  if (!result.ok) return fail(result.state, result.detail);

  const payload = asDict(result.data);
  const rows = Array.isArray(payload?.["searchResults"]) ? payload["searchResults"] : result.data;
  const companies = (Array.isArray(rows) ? rows : [])
    .map(mapGemiCompany)
    .filter((c): c is GemiCompanySummary => Boolean(c));
  if (!companies.length) return fail("NOT_FOUND", "nessuna società per i criteri indicati");
  return { ok: true, data: companies, state: "OK" };
}

export async function getGemiCompany(
  arGemi: string,
  signal?: AbortSignal,
): Promise<GemiApiResult<GemiCompanySummary>> {
  const key = gemiApiKey();
  if (!key) return fail("NO_KEY", "GEMI_API_KEY non configurata");
  const result = await getJson(`/companies/${encodeURIComponent(arGemi)}`, key, signal);
  if (!result.ok) return fail(result.state, result.detail);
  const company = mapGemiCompany(result.data);
  return company
    ? { ok: true, data: company, state: "OK" }
    : fail("NOT_FOUND", "record ΓΕΜΗ non leggibile");
}

/** GET /companies/{arGemi}/documents — payload grezzo, analizzato dal resolver. */
export async function getGemiDocumentsRaw(
  arGemi: string,
  signal?: AbortSignal,
): Promise<GemiApiResult<unknown>> {
  const key = gemiApiKey();
  if (!key) return fail("NO_KEY", "GEMI_API_KEY non configurata");
  return getJson(`/companies/${encodeURIComponent(arGemi)}/documents`, key, signal);
}

/** Costruisce l'URL binario ufficiale /downloadFile (la chiave resta lato server). */
export function gemiDownloadFileUrl(downloadKey: string, elementId: string | number): string {
  const key = String(downloadKey || "assemblyDecision").replace(/[^A-Za-z0-9_-]/g, "");
  const id = String(elementId).replace(/\D/g, "");
  if (!id) return "";
  return `${GEMI_OPENDATA_BASE}/downloadFile?key=${encodeURIComponent(key)}&elementId=${encodeURIComponent(id)}`;
}
