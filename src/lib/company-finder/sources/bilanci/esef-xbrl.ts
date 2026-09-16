/**
 * ESEF / xBRL-JSON — bilanci strutturati degli emittenti quotati europei.
 *
 * Fonte: filings.xbrl.org (XBRL International). Gratuita, senza chiave, senza
 * WAF, senza limite di frequenza dichiarato. Raccoglie i depositi in formato
 * ESEF previsti dal Regolamento delegato (UE) 2019/815 e ne pubblica la
 * rappresentazione xBRL-JSON (specifica xBRL-JSON 1.0), cioè i fatti
 * contabili già estratti dall'iXBRL.
 *
 * Copertura verificata il 9 settembre 2026 interrogando l'API:
 *   - PL: 877 depositi;
 *   - FR: presenti;
 *   - DE: ZERO. XBRL International dichiara in
 *     https://filings.xbrl.org/docs/about di non riuscire a reperire i
 *     depositi tedeschi. Per la Germania questa fonte non è utilizzabile e
 *     l'adapter lo dichiara invece di restituire un vuoto ambiguo.
 *
 * L'entità è identificata dal LEI: il join con la ricerca per nome passa da
 * GLEIF (`sources/gleif.ts`), già presente nel tool.
 *
 * ATTENZIONE — due trappole verificate sui dati reali (Instal Kraków S.A.,
 * LEI 259400OOMJ31L0SWCY70, esercizio 2022):
 *
 *  1. Gli istanti di stato patrimoniale sono datati al PRIMO GIORNO
 *     dell'esercizio successivo: `Assets` al `2023-01-01T00:00:00` è il totale
 *     attivo al 31.12.2022. Leggere l'anno dalla stringa senza correzione
 *     sposta ogni voce patrimoniale di un esercizio, in silenzio.
 *  2. Gli stessi concetti compaiono anche con dimensioni (assi) — p. es.
 *     `Equity` con `ifrs-full:ComponentsOfEquityAxis` vale 7.285.500 PLN
 *     (il capitale sociale), contro i 322.923.938,15 PLN del patrimonio netto
 *     totale. Solo i fatti PRIVI di assi sono i totali di bilancio.
 */

import type { FinancialYear } from "../../types";

const ORIGIN = "https://filings.xbrl.org";
const UA = "TPBox-CompanyFinder/1.0";
const TIMEOUT_MS = 20_000;
const MAX_JSON_BYTES = 12 * 1024 * 1024;

/** Paesi per cui la fonte è nota essere vuota: non va interrogata. */
export const ESEF_UNSUPPORTED_ISOS = new Set(["DE", "IE"]);

export interface EsefFiling {
  /** id numerico del deposito su filings.xbrl.org */
  id: string;
  lei: string;
  entityName?: string | undefined;
  country: string;
  /** data di chiusura dichiarata dal deposito (YYYY-MM-DD) */
  periodEnd: string;
  fiscalYear?: number | undefined;
  jsonPath?: string | undefined;
  packagePath?: string | undefined;
  errorCount: number;
}

export interface EsefResult {
  ok: boolean;
  years: FinancialYear[];
  filings: EsefFiling[];
  currency?: string | undefined;
  error?: string | undefined;
}

// ---------------------------------------------------------------- periodi

/**
 * Esercizio di riferimento di un istante.
 * Un istante al 1° gennaio è la chiusura dell'esercizio precedente: è la
 * convenzione XBRL per l'"inizio giornata". Verificata sui dati reali.
 */
export function fiscalYearFromInstant(instant: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(instant.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = match[2];
  const day = match[3];
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return undefined;
  return month === "01" && day === "01" ? year - 1 : year;
}

/**
 * Esercizio di riferimento di un periodo xBRL-JSON.
 * Durata: "inizio/fine" — conta la fine, con la stessa correzione del 1° gennaio.
 * Istante: valore singolo.
 */
export function fiscalYearFromPeriod(period: string): number | undefined {
  const value = period.trim();
  if (!value) return undefined;
  const slash = value.indexOf("/");
  return slash > 0 ? fiscalYearFromInstant(value.slice(slash + 1)) : fiscalYearFromInstant(value);
}

export function isDurationPeriod(period: string): boolean {
  return period.includes("/");
}

// ------------------------------------------------------------- concetti

/** Chiavi di dimensione che NON sono assi: la loro presenza non qualifica il fatto. */
const NON_AXIS_KEYS = new Set(["concept", "entity", "period", "unit", "language", "noteId"]);

/**
 * Concetti IFRS accettati per ogni voce, in ordine di preferenza.
 * Il nome è confrontato senza prefisso di namespace, così valgono sia
 * `ifrs-full:Revenue` sia eventuali prefissi diversi usati dall'emittente.
 *
 * `ebitda` non compare: non è una voce del tassonomia IFRS e non va dedotta.
 * Se serve, va calcolata a valle con gli ammortamenti effettivamente esposti.
 */
const CONCEPT_PREFERENCE: Record<keyof EsefMeasures, readonly string[]> = {
  revenue: ["Revenue", "RevenueFromContractsWithCustomers"],
  operatingProfit: ["ProfitLossFromOperatingActivities", "OperatingIncomeLoss"],
  netIncome: ["ProfitLoss", "ProfitLossAttributableToOwnersOfParent"],
  totalAssets: ["Assets"],
  equity: ["Equity", "EquityAttributableToOwnersOfParent"],
};

interface EsefMeasures {
  revenue?: number | undefined;
  operatingProfit?: number | undefined;
  netIncome?: number | undefined;
  totalAssets?: number | undefined;
  equity?: number | undefined;
}

interface RawFact {
  value?: unknown;
  dimensions?: Record<string, unknown> | undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function shortConcept(qname: string): string {
  const colon = qname.lastIndexOf(":");
  return colon >= 0 ? qname.slice(colon + 1) : qname;
}

function currencyFromUnit(unit: string): string | undefined {
  const match = /^iso4217:([A-Z]{3})$/.exec(unit.trim());
  return match?.[1];
}

/** Un fatto è un totale di bilancio solo se non porta assi dimensionali. */
export function isUndimensionedFact(dimensions: Record<string, unknown>): boolean {
  for (const key of Object.keys(dimensions)) {
    if (!NON_AXIS_KEYS.has(key)) return false;
  }
  return true;
}

function parseAmount(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "nil") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Estrae gli esercizi da un documento xBRL-JSON.
 *
 * Regole applicate, tutte verificate sui dati reali:
 *  - solo fatti privi di assi dimensionali;
 *  - voci di conto economico solo da periodi di durata, voci patrimoniali solo
 *    da istanti: così un `ProfitLoss` istantaneo dello schema di movimentazione
 *    del patrimonio netto non può essere scambiato per l'utile d'esercizio;
 *  - a parità di voce ed esercizio vince il concetto più in alto nella
 *    preferenza; a parità di concetto, il primo incontrato non viene
 *    sovrascritto.
 */
export function extractEsefYears(payload: unknown): { years: FinancialYear[]; currency?: string | undefined } {
  const root = asRecord(payload);
  const facts = asRecord(root?.["facts"]);
  if (!facts) return { years: [] };

  const byYear = new Map<number, EsefMeasures>();
  const rankByYear = new Map<number, Partial<Record<keyof EsefMeasures, number>>>();
  const currencyCount = new Map<string, number>();

  for (const raw of Object.values(facts)) {
    const fact = asRecord(raw) as RawFact | undefined;
    if (!fact) continue;
    const dimensions = asRecord(fact.dimensions);
    if (!dimensions || !isUndimensionedFact(dimensions)) continue;

    const conceptRaw = dimensions["concept"];
    const periodRaw = dimensions["period"];
    const unitRaw = dimensions["unit"];
    if (typeof conceptRaw !== "string" || typeof periodRaw !== "string") continue;
    if (typeof unitRaw !== "string") continue;

    const currency = currencyFromUnit(unitRaw);
    if (!currency) continue;

    const amount = parseAmount(fact.value);
    if (amount === undefined) continue;

    const year = fiscalYearFromPeriod(periodRaw);
    if (year === undefined) continue;

    const concept = shortConcept(conceptRaw);
    const duration = isDurationPeriod(periodRaw);

    for (const [field, preferences] of Object.entries(CONCEPT_PREFERENCE) as [keyof EsefMeasures, readonly string[]][]) {
      const rank = preferences.indexOf(concept);
      if (rank < 0) continue;
      const wantsDuration = field === "revenue" || field === "operatingProfit" || field === "netIncome";
      if (wantsDuration !== duration) continue;

      const measures = byYear.get(year) ?? {};
      const ranks = rankByYear.get(year) ?? {};
      const previous = ranks[field];
      if (previous !== undefined && previous <= rank) continue;

      measures[field] = amount;
      ranks[field] = rank;
      byYear.set(year, measures);
      rankByYear.set(year, ranks);
      currencyCount.set(currency, (currencyCount.get(currency) ?? 0) + 1);
    }
  }

  let currency: string | undefined;
  let best = 0;
  for (const [code, count] of currencyCount) {
    if (count > best) {
      best = count;
      currency = code;
    }
  }

  const years: FinancialYear[] = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, measures]) => ({
      periodLabel: String(year),
      year,
      ...(measures.revenue === undefined ? {} : { revenue: measures.revenue }),
      ...(measures.operatingProfit === undefined ? {} : { operatingProfit: measures.operatingProfit }),
      ...(measures.netIncome === undefined ? {} : { netIncome: measures.netIncome }),
      ...(measures.totalAssets === undefined ? {} : { totalAssets: measures.totalAssets }),
      ...(measures.equity === undefined ? {} : { equity: measures.equity }),
      currency: currency ?? "EUR",
    }))
    .filter((entry) =>
      entry.revenue !== undefined ||
      entry.operatingProfit !== undefined ||
      entry.netIncome !== undefined ||
      entry.totalAssets !== undefined ||
      entry.equity !== undefined);

  return currency === undefined ? { years } : { years, currency };
}

// ---------------------------------------------------------------- rete

function normalizeLei(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidLei(value: string): boolean {
  return /^[A-Z0-9]{18}[0-9]{2}$/.test(normalizeLei(value));
}

async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${ORIGIN}${path}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`filings.xbrl.org HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_JSON_BYTES) throw new Error("documento xBRL-JSON troppo grande");
  const text = await response.text();
  if (text.length > MAX_JSON_BYTES) throw new Error("documento xBRL-JSON troppo grande");
  return JSON.parse(text) as unknown;
}

function mapFiling(entry: unknown, lei: string, entityName?: string): EsefFiling | undefined {
  const record = asRecord(entry);
  const attributes = asRecord(record?.["attributes"]);
  const id = record?.["id"];
  if (!attributes || typeof id !== "string") return undefined;

  const periodEnd = attributes["period_end"];
  if (typeof periodEnd !== "string") return undefined;
  const country = typeof attributes["country"] === "string" ? (attributes["country"] as string) : "";
  const jsonPath = typeof attributes["json_url"] === "string" ? (attributes["json_url"] as string) : undefined;
  const packagePath = typeof attributes["package_url"] === "string" ? (attributes["package_url"] as string) : undefined;
  const errorCount = Number(attributes["error_count"] ?? 0);
  const fiscalYear = fiscalYearFromInstant(periodEnd);

  return {
    id,
    lei,
    ...(entityName === undefined ? {} : { entityName }),
    country,
    periodEnd,
    ...(fiscalYear === undefined ? {} : { fiscalYear }),
    ...(jsonPath === undefined ? {} : { jsonPath }),
    ...(packagePath === undefined ? {} : { packagePath }),
    errorCount: Number.isFinite(errorCount) ? errorCount : 0,
  };
}

/** Elenco dei depositi ESEF di un'entità, dal più recente. */
export async function listEsefFilings(lei: string, timeoutMs = TIMEOUT_MS): Promise<EsefFiling[]> {
  const normalized = normalizeLei(lei);
  if (!isValidLei(normalized)) throw new Error("LEI non valido");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const payload = await getJson(`/api/entities/${encodeURIComponent(normalized)}/filings`, controller.signal);
    const root = asRecord(payload);
    const data = root?.["data"];
    if (!Array.isArray(data)) return [];
    const filings: EsefFiling[] = [];
    for (const entry of data) {
      const mapped = mapFiling(entry, normalized);
      if (mapped) filings.push(mapped);
    }
    return filings.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bilanci strutturati di un emittente quotato, dal LEI.
 *
 * Interroga al più `maxFilings` depositi, dal più recente: un solo documento
 * xBRL-JSON contiene già l'esercizio e il comparativo, quindi due depositi
 * bastano di norma per quattro esercizi.
 */
export async function fetchEsefFinancials(
  lei: string,
  options: { iso?: string | undefined; maxFilings?: number | undefined; timeoutMs?: number | undefined } = {},
): Promise<EsefResult> {
  const iso = (options.iso ?? "").toUpperCase();
  if (iso && ESEF_UNSUPPORTED_ISOS.has(iso)) {
    return {
      ok: false,
      years: [],
      filings: [],
      error: `ESEF non disponibile per ${iso}: filings.xbrl.org dichiara di non riuscire a reperire i depositi di questo Paese`,
    };
  }

  const normalized = normalizeLei(lei);
  if (!isValidLei(normalized)) return { ok: false, years: [], filings: [], error: "LEI non valido" };

  const maxFilings = Math.max(1, Math.min(4, options.maxFilings ?? 2));
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  const remaining = (): number => Math.max(1, deadline - Date.now());

  let filings: EsefFiling[];
  try {
    filings = await listEsefFilings(normalized, Math.min(remaining(), timeoutMs));
  } catch (error) {
    const err = error as { name?: string; message?: string };
    return {
      ok: false,
      years: [],
      filings: [],
      error: err?.name === "AbortError" ? "timeout filings.xbrl.org" : (err?.message ?? "errore di rete filings.xbrl.org"),
    };
  }

  if (!filings.length) return { ok: false, years: [], filings: [], error: "nessun deposito ESEF per questo LEI" };

  const merged = new Map<number, FinancialYear>();
  let currency: string | undefined;
  let lastError: string | undefined;

  for (const filing of filings.slice(0, maxFilings)) {
    if (!filing.jsonPath || remaining() <= 250) continue;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining());
    try {
      const payload = await getJson(filing.jsonPath, controller.signal);
      const extracted = extractEsefYears(payload);
      if (extracted.currency && !currency) currency = extracted.currency;
      for (const entry of extracted.years) {
        if (entry.year === undefined) continue;
        // il deposito più recente vince: non si sovrascrive con il comparativo
        if (!merged.has(entry.year)) merged.set(entry.year, entry);
      }
    } catch (error) {
      const err = error as { name?: string; message?: string };
      lastError = err?.name === "AbortError" ? "timeout documento xBRL-JSON" : (err?.message ?? "errore documento xBRL-JSON");
    } finally {
      clearTimeout(timer);
    }
  }

  const years = [...merged.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  if (!years.length) {
    return { ok: false, years: [], filings, error: lastError ?? "documento ESEF senza voci riconosciute" };
  }
  return currency === undefined ? { ok: true, years, filings } : { ok: true, years, filings, currency };
}
