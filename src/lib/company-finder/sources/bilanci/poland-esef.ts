// ---------- Polonia (e ogni emittente ESEF): filings.xbrl.org ----------
//
// filings.xbrl.org è il registro pubblico dei depositi ESEF europei: ~877
// bilanci polacchi in xBRL-JSON, gratuiti, senza chiave e senza WAF, indicizzati
// per LEI. Il join "nome → LEI" è già risolto da GLEIF, quindi per le società
// QUOTATE possiamo mostrare i valori di bilancio (ricavi, EBIT, attivo,
// patrimonio netto) senza toccare il RDF cifrato del Ministero della Giustizia.
//
// Due trappole misurate sui dati veri, qui neutralizzate:
//   1. Gli ISTANTI patrimoniali sono datati al 1° gennaio dell'anno DOPO
//      (l'attivo di fine 2022 ha period "2023-01-01"). Leggerli alla lettera
//      sposterebbe ogni voce di un esercizio, in silenzio.
//   2. `Equity` compare anche con un asse (ComponentsOfEquityAxis) a valori che
//      sono il capitale sociale, non il patrimonio netto: si accettano SOLO i
//      fatti senza dimensioni oltre a concept/entity/period/unit.
//
// L'API è JSON:API standard:
//   GET /api/entities/{LEI}/filings   → elenco depositi (period_end, json_url)
//   GET {json_url}                    → xBRL-JSON con i fatti

import type { FinancialYear, Financials } from "../../types";

const API_BASE = "https://filings.xbrl.org";
const ENTITY_FILINGS = (lei: string) =>
  `${API_BASE}/api/entities/${encodeURIComponent(lei)}/filings`;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TIMEOUT_MS = 12_000;
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 250;
const MAX_JSON_BYTES = 25 * 1024 * 1024;
/** Quanti esercizi al massimo scaricare per società (i più recenti). */
const MAX_FILINGS = 3;

// Concetti IFRS che mappiamo verso la scheda finanziaria di TPBox. L'ordine non
// conta; ogni concetto ha una sola destinazione.
const CONCEPT_MAP: Record<string, keyof FinancialYear> = {
  "ifrs-full:Revenue": "revenue",
  "ifrs-full:ProfitLossFromOperatingActivities": "operatingProfit",
  "ifrs-full:ProfitLoss": "netIncome",
  "ifrs-full:Assets": "totalAssets",
  "ifrs-full:Equity": "equity",
};

export interface EsefFilingRef {
  year: number;
  jsonUrl: string;
  viewerUrl?: string | undefined;
  periodEnd: string;
}

export interface EsefFinancialsResult {
  ok: boolean;
  data?: Financials | undefined;
  skipped?: string | undefined;
  error?: string | undefined;
}

// ------------------------------------------------------------------ helpers

function isLei(value: string): boolean {
  return /^[0-9A-Z]{20}$/.test(value.trim().toUpperCase());
}

function absolute(url: string): string {
  if (!url) return url;
  return url.startsWith("http") ? url : `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Esercizio fiscale da un `period` xBRL-JSON.
 *  · durata "start/end"   → anno di `start`
 *  · istante "YYYY-01-01" → anno precedente (chiusura dell'esercizio prima)
 *  · altro istante        → il proprio anno
 */
export function esefFiscalYear(period: string): number | undefined {
  if (!period) return undefined;
  const slash = period.indexOf("/");
  if (slash > 0) {
    const start = period.slice(0, slash);
    const y = Number(start.slice(0, 4));
    return Number.isInteger(y) ? y : undefined;
  }
  const y = Number(period.slice(0, 4));
  if (!Number.isInteger(y)) return undefined;
  // Istante al 1° gennaio = fine dell'esercizio precedente.
  return /^\d{4}-01-01/.test(period) ? y - 1 : y;
}

interface RawFact {
  value?: unknown;
  dimensions?: Record<string, unknown> | undefined;
}

/** Un fatto è "core" solo se non porta assi/membri oltre alle 4 chiavi base. */
function isCoreFact(dimensions: Record<string, unknown>): boolean {
  const allowed = new Set(["concept", "entity", "period", "unit"]);
  for (const key of Object.keys(dimensions)) {
    if (!allowed.has(key)) return false;
  }
  return true;
}

function parseAmount(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Estrae gli esercizi dalla struttura xBRL-JSON. Applica entrambe le regole
 * anti-trappola e, a parità di concetto/anno, preferisce il fatto core.
 */
export function extractEsefFinancials(payload: unknown, fallbackCurrency = "PLN"): FinancialYear[] {
  const facts = (payload as { facts?: Record<string, RawFact> } | undefined)?.facts;
  if (!facts || typeof facts !== "object") return [];

  const byYear = new Map<number, FinancialYear>();

  for (const fact of Object.values(facts)) {
    const dims = fact?.dimensions;
    if (!dims || typeof dims !== "object") continue;

    const concept = typeof dims["concept"] === "string" ? (dims["concept"] as string) : undefined;
    const period = typeof dims["period"] === "string" ? (dims["period"] as string) : undefined;
    if (!concept || !period) continue;

    const field = CONCEPT_MAP[concept];
    if (!field) continue;

    // Trappola 2: scarta i fatti dimensionati (ComponentsOfEquityAxis, member…).
    if (!isCoreFact(dims as Record<string, unknown>)) continue;

    const year = esefFiscalYear(period);
    if (year === undefined || year < 1990 || year > 2100) continue;

    const amount = parseAmount(fact.value);
    if (amount === undefined) continue;

    const unit = typeof dims["unit"] === "string" ? (dims["unit"] as string) : "";
    const currency = unit.includes(":")
      ? (unit.split(":")[1] ?? fallbackCurrency)
      : fallbackCurrency;

    let entry = byYear.get(year);
    if (!entry) {
      entry = { periodLabel: String(year), year, currency };
      byYear.set(year, entry);
    }
    // Primo valore vince: i fatti core sono già filtrati, evitiamo sovrascritture
    // accidentali da duplicati (es. ProfitLoss ripetuto nel prospetto OCI).
    if (entry[field] === undefined) {
      (entry as unknown as Record<string, unknown>)[field] = amount;
    }
  }

  return [...byYear.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}

/** Normalizza la lista JSON:API dei depositi in riferimenti utilizzabili. */
export function parseEsefFilingList(payload: unknown): EsefFilingRef[] {
  const data = (payload as { data?: unknown } | undefined)?.data;
  if (!Array.isArray(data)) return [];

  const refs: EsefFilingRef[] = [];
  for (const item of data) {
    const attrs = (item as { attributes?: Record<string, unknown> } | undefined)?.attributes;
    if (!attrs) continue;
    const jsonUrl = typeof attrs["json_url"] === "string" ? (attrs["json_url"] as string) : "";
    if (!jsonUrl) continue; // filing senza xBRL-JSON: non utilizzabile lato server
    const periodEnd =
      typeof attrs["period_end"] === "string" ? (attrs["period_end"] as string) : "";
    const year = Number(periodEnd.slice(0, 4));
    if (!Number.isInteger(year)) continue;
    const viewerUrl =
      typeof attrs["viewer_url"] === "string" && attrs["viewer_url"]
        ? absolute(attrs["viewer_url"] as string)
        : undefined;
    refs.push({ year, jsonUrl: absolute(jsonUrl), viewerUrl, periodEnd });
  }

  return refs.sort((a, b) => b.year - a.year);
}

// --------------------------------------------------------------- rete (HA)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET con timeout e retry idempotente (backoff esponenziale + jitter). */
async function getWithRetry(
  url: string,
  accept: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const composite = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    try {
      const res = await fetchImpl(url, {
        headers: { "User-Agent": UA, Accept: accept },
        redirect: "follow",
        signal: composite,
        cache: "no-store",
      });
      // Solo gli errori transitori sono idempotentemente ritentabili.
      if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
        lastError = new Error(`ESEF HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("ESEF: errore di rete");
    } finally {
      clearTimeout(timer);
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      const jitter = 1 + (Math.random() * 0.8 - 0.4); // ±40%
      await sleep(Math.round(BASE_DELAY_MS * 2 ** attempt * jitter));
    }
  }
  throw lastError ?? new Error("ESEF: fonte non raggiungibile");
}

async function readJson(res: Response): Promise<unknown> {
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_JSON_BYTES) throw new Error("ESEF: documento troppo grande");
  return JSON.parse(new TextDecoder("utf-8").decode(buf));
}

/**
 * Recupera i valori di bilancio di un emittente ESEF dal suo LEI. Scarica al più
 * gli ultimi `MAX_FILINGS` depositi e unisce gli esercizi (i comparativi di un
 * anno completano quelli mancanti dell'anno prima).
 */
export async function fetchPolishEsefFinancials(
  lei: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal; currency?: string } = {},
): Promise<EsefFinancialsResult> {
  const code = lei.trim().toUpperCase();
  if (!isLei(code)) return { ok: false, skipped: "LEI non valido per la ricerca ESEF" };

  const fetchImpl = options.fetchImpl ?? fetch;
  const currency = options.currency ?? "PLN";

  let filings: EsefFilingRef[];
  try {
    const listRes = await getWithRetry(
      ENTITY_FILINGS(code),
      "application/vnd.api+json,application/json",
      fetchImpl,
      options.signal,
    );
    if (listRes.status === 404)
      return { ok: false, skipped: "nessun deposito ESEF per questo LEI" };
    if (!listRes.ok) return { ok: false, error: `ESEF lista HTTP ${listRes.status}` };
    filings = parseEsefFilingList(await readJson(listRes));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ESEF: lista non raggiungibile" };
  }

  if (filings.length === 0) return { ok: false, skipped: "nessun bilancio ESEF depositato" };

  const byYear = new Map<number, FinancialYear>();
  let viewerUrl: string | undefined;
  let anySuccess = false;

  for (const filing of filings.slice(0, MAX_FILINGS)) {
    try {
      const res = await getWithRetry(filing.jsonUrl, "application/json", fetchImpl, options.signal);
      if (!res.ok) continue;
      const years = extractEsefFinancials(await readJson(res), currency);
      if (years.length > 0) {
        anySuccess = true;
        if (!viewerUrl && filing.viewerUrl) viewerUrl = filing.viewerUrl;
        for (const y of years) {
          if (y.year === undefined) continue;
          const existing = byYear.get(y.year);
          if (!existing) {
            byYear.set(y.year, y);
          } else {
            // Completa i campi mancanti senza sovrascrivere quelli già noti.
            for (const [k, v] of Object.entries(y)) {
              if (
                (existing as unknown as Record<string, unknown>)[k] === undefined &&
                v !== undefined
              ) {
                (existing as unknown as Record<string, unknown>)[k] = v;
              }
            }
          }
        }
      }
    } catch {
      // Un deposito illeggibile non deve invalidare gli altri: si prosegue.
      continue;
    }
  }

  if (!anySuccess || byYear.size === 0) {
    return { ok: false, error: "ESEF: nessun valore di bilancio estraibile" };
  }

  const years = [...byYear.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const data: Financials = {
    available: true,
    currency,
    years,
    source: "ESEF — filings.xbrl.org (deposito ufficiale iXBRL)",
    note: "Valori dai depositi ESEF/iXBRL ufficiali pubblicati su filings.xbrl.org, indicizzati per LEI. Disponibili per le società quotate soggette all'obbligo ESEF.",
    ...(viewerUrl ? { documentUrl: viewerUrl, documentTitle: "Bilancio ESEF (iXBRL viewer)" } : {}),
  };
  return { ok: true, data };
}
