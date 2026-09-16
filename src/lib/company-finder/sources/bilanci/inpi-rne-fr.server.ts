/**
 * Francia — bilanci dal Registre National des Entreprises (INPI).
 *
 * È la fonte completa e gratuita per la Francia: restituisce sia il PDF dei
 * conti annuali depositati, sia il «bilan saisi», cioè la liasse fiscale già
 * digitata voce per voce. Per il transfer pricing è la differenza fra avere due
 * numeri (cifra d'affari e utile netto, quanto offre recherche-entreprises) e
 * avere tutti gli ingressi di un PLI: risultato d'esercizio, totale attivo,
 * patrimonio netto, ammortamenti.
 *
 * Accesso: account gratuito su https://data.inpi.fr, nessuna carta e nessun
 * costo. Le credenziali arrivano da INPI_RNE_USERNAME e INPI_RNE_PASSWORD. Se
 * mancano, l'adapter si dichiara non configurato e la catena francese ripiega
 * su recherche-entreprises.api.gouv.fr, che non chiede autenticazione.
 *
 * Contratto (documentazione tecnica INPI «API comptes annuels» v5):
 *   POST /api/sso/login                       -> { token }
 *   GET  /api/companies/{siren}/attachments   -> { bilans[], bilansSaisis[] }
 *   GET  /api/bilans-saisis/{id}              -> { bilanSaisi: { bilan: {...} } }
 *   GET  /api/bilans-pdf/{id}                 -> PDF
 *
 * Regola d'oro del tool: nessun URL del registro esce verso il client. I
 * documenti sono esposti solo con un identificativo opaco, risolto dalla rotta
 * interna del proxy.
 */

import type { FinancialDocumentSummary, FinancialYear } from "../../types";
import { extractFromBilanSaisi, flattenLiassePages, type LiasseField } from "./liasse-fiscale";

const ORIGIN = "https://registre-national-entreprises.inpi.fr";
const UA = "TPBox-CompanyFinder/1.0";
const TIMEOUT_MS = 25_000;
const MAX_PDF_BYTES = 30 * 1024 * 1024;
/** Il token INPI dura un'ora; si rinnova con margine. */
const TOKEN_TTL_MS = 50 * 60 * 1000;

export interface InpiBilanRef {
  id: string;
  siren: string;
  denomination?: string | undefined;
  dateDepot?: string | undefined;
  dateCloture?: string | undefined;
  /** C complet, S simplifié, K consolidé, B banque, A assurance. */
  typeBilan?: string | undefined;
  confidentiality?: string | undefined;
  deleted: boolean;
  /** true quando il riferimento viene dall'elenco `bilansSaisis`. */
  saisi: boolean;
  year?: number | undefined;
}

export interface InpiFinancialsResult {
  ok: boolean;
  configured: boolean;
  years: FinancialYear[];
  documents: FinancialDocumentSummary[];
  warnings: string[];
  unverifiedFields: LiasseField[];
  error?: string | undefined;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | undefined;

/** Azzera il token in cache. Usato dai test e dopo un 401. */
export function resetInpiToken(): void {
  tokenCache = undefined;
}

export function inpiCredentials(
  env: Record<string, string | undefined> = process.env,
): { username: string; password: string } | undefined {
  const username = env["INPI_RNE_USERNAME"]?.trim();
  const password = env["INPI_RNE_PASSWORD"]?.trim();
  return username && password ? { username, password } : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function str(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Validazione Luhn del SIREN: un refuso non deve travestirsi da guasto del registro. */
export function sirenIsValid(siren: string): boolean {
  const digits = siren.replace(/\D/g, "");
  if (!/^\d{9}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    const raw = digits.charCodeAt(8 - i) - 48;
    if (i % 2 === 1) {
      const doubled = raw * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    } else {
      sum += raw;
    }
  }
  return sum % 10 === 0;
}

// ------------------------------------------------------------------ token

async function login(signal: AbortSignal): Promise<string> {
  const credentials = inpiCredentials();
  if (!credentials) throw new Error("INPI non configurato");
  const response = await fetch(`${ORIGIN}/api/sso/login`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username: credentials.username, password: credentials.password }),
    signal,
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) throw new Error("credenziali INPI rifiutate");
  if (!response.ok) throw new Error(`INPI login HTTP ${response.status}`);
  const payload = asRecord(await response.json());
  const token = payload ? str(payload, "token") : undefined;
  if (!token) throw new Error("INPI login senza token");
  return token;
}

async function bearer(signal: AbortSignal, force = false): Promise<string> {
  if (!force && tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  const token = await login(signal);
  tokenCache = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

async function authorized(path: string, signal: AbortSignal, accept = "application/json"): Promise<Response> {
  let token = await bearer(signal);
  const call = (value: string): Promise<Response> =>
    fetch(`${ORIGIN}${path}`, {
      headers: { "User-Agent": UA, Accept: accept, Authorization: `Bearer ${value}` },
      signal,
      cache: "no-store",
    });
  let response = await call(token);
  if (response.status === 401) {
    // token scaduto prima del previsto: una sola ripetizione
    token = await bearer(signal, true);
    response = await call(token);
  }
  return response;
}

// ------------------------------------------------------------- attachments

function yearOfCloture(dateCloture: string | undefined): number | undefined {
  if (!dateCloture) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateCloture);
  if (!match) return undefined;
  const year = Number(match[1]);
  if (!Number.isFinite(year)) return undefined;
  return match[2] === "01" && match[3] === "01" ? year - 1 : year;
}

function mapRef(entry: unknown, saisi: boolean): InpiBilanRef | undefined {
  const record = asRecord(entry);
  if (!record) return undefined;
  const id = str(record, "id");
  if (!id) return undefined;
  const dateCloture = str(record, "dateCloture");
  const denomination = str(record, "denomination");
  const dateDepot = str(record, "dateDepot");
  const typeBilan = str(record, "typeBilan");
  const confidentiality = str(record, "confidentiality");
  const year = yearOfCloture(dateCloture);
  return {
    id,
    siren: str(record, "siren") ?? "",
    ...(denomination === undefined ? {} : { denomination }),
    ...(dateDepot === undefined ? {} : { dateDepot }),
    ...(dateCloture === undefined ? {} : { dateCloture }),
    ...(typeBilan === undefined ? {} : { typeBilan }),
    ...(confidentiality === undefined ? {} : { confidentiality }),
    deleted: record["deleted"] === true,
    saisi,
    ...(year === undefined ? {} : { year }),
  };
}

/**
 * Elenco dei bilanci depositati di una società.
 *
 * I riferimenti con `deleted: true` sono esclusi: l'INPI ne impone la rimozione
 * anche dalle copie già scaricate.
 */
export async function listInpiBilans(siren: string, timeoutMs = TIMEOUT_MS): Promise<InpiBilanRef[]> {
  const digits = siren.replace(/\D/g, "");
  if (!sirenIsValid(digits)) throw new Error("SIREN non valido");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await authorized(`/api/companies/${digits}/attachments`, controller.signal);
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`INPI attachments HTTP ${response.status}`);
    const payload = asRecord(await response.json());
    const refs: InpiBilanRef[] = [];
    for (const [key, saisi] of [["bilans", false], ["bilansSaisis", true]] as const) {
      const list = payload?.[key];
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        const mapped = mapRef(entry, saisi);
        if (mapped && !mapped.deleted) refs.push(mapped);
      }
    }
    return refs.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------ bilan saisi

/** Trova il blocco `bilan` dentro la risposta, senza assumerne la profondità. */
function findBilanBlock(payload: unknown): Record<string, unknown> | undefined {
  const seen = new Set<unknown>();
  const visit = (value: unknown): Record<string, unknown> | undefined => {
    const record = asRecord(value);
    if (!record || seen.has(record)) return undefined;
    seen.add(record);
    if (asRecord(record["identite"]) && record["detail"] !== undefined) return record;
    for (const child of Object.values(record)) {
      if (Array.isArray(child)) {
        for (const item of child) {
          const found = visit(item);
          if (found) return found;
        }
        continue;
      }
      const found = visit(child);
      if (found) return found;
    }
    return undefined;
  };
  return visit(payload);
}

export interface InpiBilanSaisiResult {
  ok: boolean;
  years: FinancialYear[];
  warnings: string[];
  unverifiedFields: LiasseField[];
  error?: string | undefined;
}

/** Scarica un bilancio digitato e lo converte in esercizi di bilancio. */
export async function fetchInpiBilanSaisi(id: string, timeoutMs = TIMEOUT_MS): Promise<InpiBilanSaisiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fail = (error: string): InpiBilanSaisiResult => ({ ok: false, years: [], warnings: [], unverifiedFields: [], error });
  try {
    const response = await authorized(`/api/bilans-saisis/${encodeURIComponent(id)}`, controller.signal);
    if (!response.ok) return fail(`INPI bilan-saisi HTTP ${response.status}`);
    const payload: unknown = await response.json();
    const bilan = findBilanBlock(payload);
    const identite = bilan ? asRecord(bilan["identite"]) : undefined;
    if (!bilan || !identite) return fail("risposta INPI senza blocco identite/detail");

    const dateCloture = str(identite, "dateClotureExercice") ?? str(identite, "dateCloture");
    if (!dateCloture) return fail("bilancio senza data di chiusura");

    const rows = flattenLiassePages(bilan["detail"]);
    if (!rows.length) return fail("bilancio digitato senza righe di liassa");

    const codeConfidentialite = num(identite, "codeConfidentialite");
    const codeSaisie = num(identite, "codeSaisie");
    const extraction = extractFromBilanSaisi({
      siren: str(identite, "siren") ?? "",
      dateCloture,
      codeTypeBilan: str(identite, "codeTypeBilan") ?? str(identite, "typeBilan") ?? "C",
      ...(codeConfidentialite === undefined ? {} : { codeConfidentialite }),
      ...(codeSaisie === undefined ? {} : { codeSaisie }),
      rows,
      currency: "EUR",
    });

    return {
      ok: extraction.ok,
      years: extraction.years,
      warnings: extraction.warnings,
      unverifiedFields: extraction.unverifiedFields,
      ...(extraction.error === undefined ? {} : { error: extraction.error }),
    };
  } catch (error) {
    const err = error as { name?: string; message?: string };
    return fail(err?.name === "AbortError" ? "timeout INPI" : (err?.message ?? "errore di rete INPI"));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * PDF dei conti annuali. Chiamata solo dalla rotta interna del documento:
 * l'URL dell'INPI non deve mai raggiungere il client.
 */
export async function fetchInpiBilanPdf(
  id: string,
  timeoutMs = TIMEOUT_MS,
): Promise<{ ok: boolean; bytes: Uint8Array; contentType: string; error?: string | undefined }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fail = (error: string) => ({ ok: false, bytes: new Uint8Array(), contentType: "", error });
  try {
    const response = await authorized(`/api/bilans-pdf/${encodeURIComponent(id)}`, controller.signal, "application/pdf");
    if (!response.ok) return fail(`INPI PDF HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_PDF_BYTES) return fail("documento troppo grande");
    const bytes = new Uint8Array(buffer);
    // Un HTTP 200 non è un PDF: si controlla la firma, non il codice di stato.
    if (!new TextDecoder("latin1").decode(bytes.slice(0, 5)).startsWith("%PDF-")) {
      return fail("la risposta INPI non è un PDF");
    }
    return { ok: true, bytes, contentType: "application/pdf" };
  } catch (error) {
    const err = error as { name?: string; message?: string };
    return fail(err?.name === "AbortError" ? "timeout INPI PDF" : (err?.message ?? "errore di rete INPI PDF"));
  } finally {
    clearTimeout(timer);
  }
}

// ----------------------------------------------------------- orchestrazione

/** Identificativo opaco del documento, risolto solo dalla rotta interna. */
export function inpiDocumentRef(id: string): string {
  return `inpi:${id}`;
}

export function parseInpiDocumentRef(ref: string): string | undefined {
  return ref.startsWith("inpi:") ? ref.slice(5) : undefined;
}

/**
 * Bilanci francesi completi, dal SIREN.
 *
 * Scarica al più `maxYears` bilanci digitati, dal più recente. I bilanci non
 * digitati restano nell'elenco documentale come PDF scaricabile: è il caso dei
 * depositi più vecchi e delle società che l'INPI non ha ancora lavorato.
 */
export async function fetchInpiFinancials(
  siren: string,
  options: { maxYears?: number | undefined; timeoutMs?: number | undefined } = {},
): Promise<InpiFinancialsResult> {
  const empty = { years: [] as FinancialYear[], documents: [] as FinancialDocumentSummary[], warnings: [] as string[], unverifiedFields: [] as LiasseField[] };
  if (!inpiCredentials()) {
    return { ok: false, configured: false, ...empty, error: "INPI non configurato: mancano INPI_RNE_USERNAME e INPI_RNE_PASSWORD" };
  }

  const digits = siren.replace(/\D/g, "");
  if (!sirenIsValid(digits)) return { ok: false, configured: true, ...empty, error: "SIREN non valido" };

  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  const remaining = (): number => Math.max(1, deadline - Date.now());
  const maxYears = Math.max(1, Math.min(6, options.maxYears ?? 3));

  let refs: InpiBilanRef[];
  try {
    refs = await listInpiBilans(digits, Math.min(remaining(), timeoutMs));
  } catch (error) {
    const err = error as { name?: string; message?: string };
    return {
      ok: false,
      configured: true,
      ...empty,
      error: err?.name === "AbortError" ? "timeout INPI attachments" : (err?.message ?? "errore INPI attachments"),
    };
  }

  if (!refs.length) {
    return { ok: false, configured: true, ...empty, error: "nessun bilancio depositato all'INPI per questo SIREN" };
  }

  const documents: FinancialDocumentSummary[] = refs.map((ref) => {
    const opaque = inpiDocumentRef(ref.id);
    return {
      id: opaque,
      ...(ref.year === undefined ? {} : { year: ref.year }),
      kind: "ANNUAL_REPORT" as const,
      format: "pdf" as const,
      availability: "DOCUMENT_DOWNLOADABLE" as const,
      title: ref.dateCloture ? `Comptes annuels — exercice clos le ${ref.dateCloture}` : "Comptes annuels",
      downloadUrl: `/api/company-finder/document?ref=${encodeURIComponent(opaque)}`,
    };
  });

  const merged = new Map<number, FinancialYear>();
  const warnings: string[] = [];
  const unverified = new Set<LiasseField>();
  let lastError: string | undefined;

  const saisiRefs = refs.filter((ref) => ref.saisi);
  const queue = (saisiRefs.length ? saisiRefs : refs).slice(0, maxYears);

  for (const ref of queue) {
    if (remaining() <= 400) break;
    const result = await fetchInpiBilanSaisi(ref.id, remaining());
    for (const message of result.warnings) if (!warnings.includes(message)) warnings.push(message);
    for (const field of result.unverifiedFields) unverified.add(field);
    if (!result.ok) {
      lastError = result.error ?? lastError;
      continue;
    }
    for (const entry of result.years) {
      if (entry.year !== undefined && !merged.has(entry.year)) merged.set(entry.year, entry);
    }
  }

  const years = [...merged.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  if (!years.length) {
    return {
      ok: false,
      configured: true,
      years: [],
      documents,
      warnings,
      unverifiedFields: [...unverified],
      error: lastError ?? "nessun bilancio digitato disponibile: resta il PDF depositato",
    };
  }

  if (unverified.size) {
    warnings.push(
      `voci ottenute da una mappatura della liassa non ancora confermata sui dati reali: ${[...unverified].join(", ")} — verificare sul PDF prima dell'uso in documentazione`,
    );
  }

  return { ok: true, configured: true, years, documents, warnings, unverifiedFields: [...unverified] };
}
