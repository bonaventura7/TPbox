// ---------- ESEF — indice pubblico dei depositi (filings.xbrl.org) ----------
// Contratto verificato il 2026-09-03 (JSON:API, senza chiave, senza CAPTCHA):
//
//   GET /api/entities/{LEI}           → denominazione dell'emittente
//   GET /api/entities/{LEI}/filings   → depositi: period_end, report_url
//                                       (iXBRL), package_url (ZIP ESEF),
//                                       json_url (xBRL-JSON), sha256
//   GET /api/filings?filter[country]=HU → filtro paese ISO-2 (funziona;
//                                       il codice ISO-3 restituisce 0)
//   filter[lei] NON esiste: 400 "FilingSchema has no attribute lei".
//   Il cammino per società è quindi entities/{LEI}/filings.
//
// Copre gli emittenti su mercati regolamentati UE/SEE: per HU significa OTP,
// MOL, Richter, Magyar Telekom; per l'Italia i depositi delle ~230 quotate.
// Non copre le controllate non quotate: va detto, il job lo dichiara quando
// non trova un LEI.

import type { Financials, FinancialYear } from "../../types";

export const ESEF_BASE = "https://filings.xbrl.org";

/** Paesi dove il deposito ESEF esiste (UE 27 + SEE). UK fuori dal perimetro post-2021. */
export const ESEF_ISOS = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "NO",
  "IS",
  "LI",
]);

export interface EsefFiling {
  periodEnd: string;
  reportUrl?: string | undefined;
  packageUrl?: string | undefined;
  jsonUrl?: string | undefined;
  country?: string | undefined;
  processed?: string | undefined;
}

export interface EsefDeps {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** Periodi più recenti da tentare per l'estrazione dei valori. */
  maxPeriods?: number;
  /** Tetto ai download xBRL-JSON: i depositi delle banche possono sforare i 20 MB. */
  maxJsonBytes?: number;
}

export interface EsefOutcome {
  ok: boolean;
  data?: Financials | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
  entityName?: string | undefined;
}

const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_MAX_PERIODS = 3;
const DEFAULT_MAX_JSON_BYTES = 20 * 1024 * 1024;

function absolute(path: string | null | undefined, base: string): string | undefined {
  if (!path) return undefined;
  try {
    return new URL(path, base).toString();
  } catch {
    return undefined;
  }
}

interface RawFilingAttrs {
  period_end?: string | undefined;
  report_url?: string | null | undefined;
  package_url?: string | null | undefined;
  json_url?: string | null | undefined;
  country?: string | undefined;
  processed?: string | undefined;
}

/**
 * Dalla payload JSON:API dei filings ai depositi, senza duplicati per periodo.
 * Lo stesso esercizio compare in più lingue (/HU/0/, /HU/1/…): tiene quello
 * con json_url (serve ai valori) e, a parità, il più recentemente processato.
 */
export function parseFilingsPayload(payload: unknown, base = ESEF_BASE): EsefFiling[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const byPeriod = new Map<string, EsefFiling>();
  for (const item of data) {
    const attrs = (item as { attributes?: RawFilingAttrs })?.attributes ?? {};
    if (!attrs.period_end || !/^\d{4}-\d{2}-\d{2}$/.test(attrs.period_end)) continue;
    const filing: EsefFiling = {
      periodEnd: attrs.period_end,
      reportUrl: absolute(attrs.report_url, base),
      packageUrl: absolute(attrs.package_url, base),
      jsonUrl: absolute(attrs.json_url, base),
      country: attrs.country,
      processed: attrs.processed,
    };
    const prev = byPeriod.get(filing.periodEnd);
    if (!prev) {
      byPeriod.set(filing.periodEnd, filing);
      continue;
    }
    const better =
      (!!filing.jsonUrl && !prev.jsonUrl) ||
      (!!filing.jsonUrl === !!prev.jsonUrl && (filing.processed ?? "") > (prev.processed ?? ""));
    if (better) byPeriod.set(filing.periodEnd, filing);
  }
  return [...byPeriod.values()].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
}

// ---- Estrazione degli headline value da un documento xBRL-JSON ----

type MetricKey = "revenue" | "operatingProfit" | "netIncome" | "totalAssets" | "equity";

interface MetricSpec {
  key: MetricKey;
  /** Concetti ammessi, in ordine di priorità (coda locale, senza prefisso). */
  concepts: string[];
  /** true = grandezza "istant" (stato patrimoniale); false = "duration" (CE). */
  instant: boolean;
}

const METRICS: MetricSpec[] = [
  { key: "revenue", concepts: ["revenue", "revenuefromcontractswithcustomers"], instant: false },
  {
    key: "operatingProfit",
    concepts: ["operatingprofitloss", "profitlossfromoperatingactivities"],
    instant: false,
  },
  {
    key: "netIncome",
    concepts: ["profitloss", "profitlossattributabletoownersofparent"],
    instant: false,
  },
  { key: "totalAssets", concepts: ["assets"], instant: true },
  {
    key: "equity",
    concepts: ["equity", "equityattributabletoownersofparent"],
    instant: true,
  },
];

const BASE_DIMENSIONS = new Set(["concept", "unit", "period", "entity", "language"]);

export interface Headline {
  metrics: Partial<Record<MetricKey, number>>;
  currency?: string | undefined;
}

function normalizeCurrency(unit: string | undefined): string | undefined {
  if (!unit) return undefined;
  const tail = unit.includes(":") ? unit.slice(unit.lastIndexOf(":") + 1) : unit;
  return /^[A-Z]{3}$/.test(tail) ? tail : undefined;
}

function conceptTail(concept: string | undefined): string {
  if (!concept) return "";
  const tail = concept.includes(":") ? concept.slice(concept.lastIndexOf(":") + 1) : concept;
  return tail.toLowerCase();
}

/**
 * Estrae ricavi / utile operativo / utile netto / attivo / patrimonio da un
 * xBRL-JSON ESEF. Prende solo i fatti "consolidati" (nessuna dimensione
 * esplicita oltre le standard) e, tra i concetti ammessi, il valore del
 * periodo più recente.
 */
export function extractHeadline(doc: unknown): Headline | undefined {
  const facts = (doc as { facts?: Record<string, unknown> })?.facts;
  if (!facts || typeof facts !== "object") return undefined;

  interface Candidate {
    tail: string;
    instant: boolean;
    periodSort: string;
    value: number;
    currency?: string | undefined;
  }

  const candidates: Candidate[] = [];
  for (const raw of Object.values(facts)) {
    const fact = raw as {
      value?: unknown;
      dimensions?: Record<string, unknown>;
    };
    const dims = fact?.dimensions;
    if (!dims || typeof dims !== "object") continue;
    if (Object.keys(dims).some((k) => !BASE_DIMENSIONS.has(k))) continue;
    const period = typeof dims["period"] === "string" ? (dims["period"] as string) : "";
    if (!period) continue;
    const value = typeof fact.value === "number" ? fact.value : Number(fact.value);
    if (!Number.isFinite(value)) continue;
    const tail = conceptTail(
      typeof dims["concept"] === "string" ? (dims["concept"] as string) : undefined,
    );
    if (!tail) continue;
    const instant = !period.includes("/");
    const end = instant ? period : (period.split("/")[1] ?? "");
    if (!end) continue;
    candidates.push({
      tail,
      instant,
      periodSort: end.slice(0, 10),
      value,
      currency: normalizeCurrency(
        typeof dims["unit"] === "string" ? (dims["unit"] as string) : undefined,
      ),
    });
  }
  if (candidates.length === 0) return undefined;

  const metrics: Partial<Record<MetricKey, number>> = {};
  let currency: string | undefined;
  for (const spec of METRICS) {
    for (const wanted of spec.concepts) {
      const pool = candidates.filter((c) => c.tail === wanted && c.instant === spec.instant);
      if (pool.length === 0) continue;
      pool.sort((a, b) => b.periodSort.localeCompare(a.periodSort));
      const best = pool[0]!;
      metrics[spec.key] = best.value;
      currency = currency ?? best.currency;
      break;
    }
  }
  return Object.keys(metrics).length > 0 ? { metrics, currency } : undefined;
}

async function fetchJson(
  url: string,
  deps: { fetchFn: typeof fetch; timeoutMs: number },
): Promise<{ res: Response }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs);
  try {
    const res = await deps.fetchFn(url, {
      headers: { Accept: "application/vnd.api+json, application/json" },
      signal: ctrl.signal,
    });
    return { res };
  } finally {
    clearTimeout(timer);
  }
}

/** I depositi di {lei}, piu' recenti prima. */
export async function fetchEsefFilings(
  lei: string,
  deps: EsefDeps = {},
): Promise<{ ok: boolean; filings?: EsefFiling[]; error?: string | undefined }> {
  const fetchFn = deps.fetchFn ?? fetch;
  try {
    const { res } = await fetchJson(
      `${ESEF_BASE}/api/entities/${encodeURIComponent(lei)}/filings`,
      {
        fetchFn,
        timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT,
      },
    );
    if (!res.ok) return { ok: false, error: `ESEF HTTP ${res.status}` };
    const filings = parseFilingsPayload(await res.json());
    return { ok: true, filings };
  } catch (e) {
    const err = e as { name?: string; message?: string };
    return {
      ok: false,
      error:
        err?.name === "AbortError" ? "ESEF: timeout" : (err?.message ?? "ESEF: errore di rete"),
    };
  }
}

/**
 * Bilancio ESEF di un emittente quotato, per LEI: valori headline per gli
 * ultimi esercizi + link al documento ufficiale (proxato in pagina via
 * /api/company-finder/document, host filings.xbrl.org in whitelist).
 */
export async function fetchEsefFinancials(lei: string, deps: EsefDeps = {}): Promise<EsefOutcome> {
  const fetchFn = deps.fetchFn ?? fetch;
  const maxPeriods = deps.maxPeriods ?? DEFAULT_MAX_PERIODS;
  const maxJsonBytes = deps.maxJsonBytes ?? DEFAULT_MAX_JSON_BYTES;
  const trimmed = lei.trim();
  if (!/^[A-Z0-9]{20}$/i.test(trimmed)) return { ok: false, error: "LEI non valido" };

  // 1) L'entità dà la denominazione ufficiale; se non risponde si prosegue lo
  //    stesso (i filings bastano), senza inventare il nome.
  let entityName: string | undefined;
  try {
    const { res } = await fetchJson(`${ESEF_BASE}/api/entities/${encodeURIComponent(trimmed)}`, {
      fetchFn,
      timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT,
    });
    if (res.ok) {
      const name = ((await res.json()) as { data?: { attributes?: { name?: string } } })?.data
        ?.attributes?.name;
      if (typeof name === "string" && name.trim()) entityName = name.trim();
    }
  } catch {
    entityName = undefined;
  }

  const list = await fetchEsefFilings(trimmed, deps);
  if (!list.ok) return { ok: false, error: list.error, entityName };
  const filings = list.filings ?? [];
  if (filings.length === 0) {
    return {
      ok: false,
      skipped:
        "nessun deposito ESEF indicizzato per questo LEI: l'indice copre gli emittenti su mercati regolamentati UE/SEE",
      entityName,
    };
  }

  // 2) Valori: tenta i periodi più recenti con json_url. Ogni estrazione è
  //    indipendente: un JSON troppo grande o assente non blocca gli altri.
  const years: FinancialYear[] = [];
  const tried = filings.slice(0, maxPeriods);
  for (const filing of tried) {
    if (!filing.jsonUrl) continue;
    try {
      const { res } = await fetchJson(filing.jsonUrl, {
        fetchFn,
        timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT,
      });
      if (!res.ok) continue;
      const length = Number(res.headers.get("content-length") ?? "0");
      if (length > maxJsonBytes) continue;
      const doc = (await res.json()) as unknown;
      const headline = extractHeadline(doc);
      if (!headline) continue;
      const year: FinancialYear = {
        periodLabel: filing.periodEnd,
        currency: headline.currency ?? "EUR",
        ...(headline.metrics.revenue !== undefined && { revenue: headline.metrics.revenue }),
        ...(headline.metrics.operatingProfit !== undefined && {
          operatingProfit: headline.metrics.operatingProfit,
        }),
        ...(headline.metrics.netIncome !== undefined && { netIncome: headline.metrics.netIncome }),
        ...(headline.metrics.totalAssets !== undefined && {
          totalAssets: headline.metrics.totalAssets,
        }),
        ...(headline.metrics.equity !== undefined && { equity: headline.metrics.equity }),
      };
      years.push(year);
    } catch {
      // singolo deposito non estraibile: restano documento e altri periodi
    }
  }

  // 3) Documento: report iXBRL (auto-contenuto) oppure, in mancanza, il JSON.
  const newest = filings[0]!;
  const docTarget =
    filings.find((f) => f.reportUrl)?.reportUrl ?? newest.jsonUrl ?? newest.packageUrl;
  const documentTitle = `Relazione finanziaria annuale ${newest.periodEnd.slice(0, 4)}${entityName ? ` — ${entityName}` : ""} (ESEF)`;

  return {
    ok: true,
    entityName,
    data: {
      available: years.length > 0 || !!docTarget,
      currency: years[0]?.currency,
      years,
      source: "ESEF — filings.xbrl.org (depositi emittenti quotati UE/SEE)",
      ...(docTarget
        ? {
            documentUrl: `/api/company-finder/document?url=${encodeURIComponent(docTarget)}`,
            documentTitle,
          }
        : {}),
      note:
        years.length > 0
          ? `Valori headline estratti dal deposito xBRL-JSON (${newest.periodEnd} e precedenti): fonte ufficiale aperta, verificabile con sha256 del pacchetto ESEF.`
          : "Deposito ESEF disponibile: i valori headline non sono stati estratti (documento troppo grande o senza xBRL-JSON); il documento resta scaricabile dal link ufficiale.",
    },
  };
}
