/**
 * Risoluzione dei valori di mercato, in ordine: dato dal vivo alla data
 * richiesta, poi dataset congelato nel repository, poi voce UNAVAILABLE con il
 * motivo. Nessun passaggio produce stime.
 *
 * Il country risk Damodaran arriva solo dal dataset congelato: il file xlsx e'
 * aggiornato una volta l'anno e leggerlo a runtime richiederebbe una dipendenza
 * nuova per un dato che cambia a gennaio.
 */
import { periodEnd, todayIso, type Observation } from "./as-of";
import { fetchObservation, pooled, SourceError } from "./connectors.server";
import {
  ALL_METRICS,
  COUNTRY_METRIC,
  FX_METRICS,
  RATE_METRICS,
  sourceUrlFor,
  type Metric,
} from "./registry";
import { DATASET } from "./snapshots/manifest";
import {
  SNAPSHOT_COUNTRY,
  SNAPSHOT_DATE,
  SNAPSHOT_FX,
  SNAPSHOT_RATES,
  type SnapshotPoint,
} from "./snapshots/2026-09-03";
import type {
  CountryEntry,
  MarketBundle,
  MarketEntry,
  MarketBundleCounts,
  MissingEntry,
  ResolvedEntry,
} from "./types";

const STALE_MARGIN_DAYS = 45;
const COUNTRY_STALE_AFTER_DAYS = 410;
export const DEFAULT_BUDGET_MS = 20_000;
/** Fonte-specific budgets: Treasury is a single primary XML feed for the USD curve. */
const TIMEOUT_BY_SOURCE = { ECB: 5_000, FRED: 8_000, TREASURY: 5_000, DAMODARAN: 8_000 } as const;
const CONCURRENCY = 20;

function periodLengthDays(period: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return 1;
  if (/^\d{4}-\d{2}$/.test(period)) return 31;
  if (/^\d{4}-Q[1-4]$/.test(period)) return 92;
  if (/^\d{4}-S[12]$/.test(period)) return 183;
  return 365;
}

function staleAfterDays(period: string): number {
  return periodLengthDays(period) + STALE_MARGIN_DAYS;
}

function daysFromPeriodTo(period: string, isoDate: string): number {
  const [year, month, day] = periodEnd(period);
  const from = Date.UTC(year, month - 1, day);
  const to = new Date(`${isoDate}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

function provenance(metric: Metric, requestedDate: string, retrievedAt: string) {
  return {
    metricId: metric.id,
    label: metric.label,
    requestedDate,
    unit: metric.unit,
    source: metric.source,
    series: metric.series,
    sourceUrl: sourceUrlFor(metric),
    retrievedAt,
  };
}

function missing(metric: Metric, requestedDate: string, retrievedAt: string, reason: string): MissingEntry {
  return { status: "UNAVAILABLE", ...provenance(metric, requestedDate, retrievedAt), reason };
}

function fromSnapshot(
  metric: Metric,
  point: SnapshotPoint | undefined,
  requestedDate: string,
  retrievedAt: string,
  liveReason: string | null,
): MarketEntry {
  const prefix = liveReason === null ? "" : `fonte non raggiungibile (${liveReason}); `;
  if (point === undefined) {
    return missing(metric, requestedDate, retrievedAt, `${prefix}serie non presente nel dataset congelato del ${SNAPSHOT_DATE}`);
  }
  const gap = daysFromPeriodTo(point.asOf, requestedDate);
  if (gap < 0) {
    return missing(metric, requestedDate, retrievedAt, `${prefix}il dataset congelato riporta l'osservazione al ${point.asOf}, successiva alla data richiesta: per una data anteriore serve la fonte`);
  }
  return {
    status: "OK",
    ...provenance(metric, requestedDate, retrievedAt),
    value: point.value,
    asOf: point.asOf,
    cacheStatus: gap > staleAfterDays(point.asOf) ? "CACHED_STALE" : "CACHED",
    snapshotDate: SNAPSHOT_DATE,
  };
}

function snapshotPointFor(metric: Metric): SnapshotPoint | undefined {
  if (metric.kind === "fx") return SNAPSHOT_FX[metric.pair];
  return SNAPSHOT_RATES[metric.id];
}

function live(metric: Metric, requestedDate: string, retrievedAt: string, period: string, value: number): ResolvedEntry {
  return {
    status: "OK",
    ...provenance(metric, requestedDate, retrievedAt),
    value,
    asOf: period,
    cacheStatus: "LIVE",
    snapshotDate: null,
  };
}

function countryEntry(requestedDate: string, retrievedAt: string): CountryEntry {
  const gap = daysFromPeriodTo(SNAPSHOT_COUNTRY.asOf, requestedDate);
  if (gap < 0) {
    return missing(COUNTRY_METRIC, requestedDate, retrievedAt, `il dataset disponibile è l'aggiornamento del ${SNAPSHOT_COUNTRY.asOf}: per una data anteriore serve il file Damodaran dell'anno corrispondente`);
  }
  return {
    status: "OK",
    ...provenance(COUNTRY_METRIC, requestedDate, retrievedAt),
    data: SNAPSHOT_COUNTRY.data,
    asOf: SNAPSHOT_COUNTRY.asOf,
    cacheStatus: gap > COUNTRY_STALE_AFTER_DAYS ? "CACHED_STALE" : "CACHED",
    snapshotDate: SNAPSHOT_DATE,
  };
}

export interface BundleOptions {
  readonly date: string;
  readonly live: boolean;
  readonly budgetMs: number;
}

export async function buildMarketBundle(options: BundleOptions): Promise<MarketBundle> {
  const requestedDate = options.date;
  const retrievedAt = new Date().toISOString();
  const warnings: string[] = [];
  const fetchable = [...FX_METRICS, ...RATE_METRICS];
  const resolved = new Map<string, MarketEntry>();

  if (options.live) {
    const deadlineAt = Date.now() + options.budgetMs;
    const controller = new AbortController();
    const budget = setTimeout(() => controller.abort(), options.budgetMs);
    try {
      const outcomes = await pooled(
        fetchable.map((metric) => async (): Promise<[Metric, Observationish]> => {
          try {
            const observation = await fetchObservation(metric, requestedDate, {
              timeoutMs: TIMEOUT_BY_SOURCE[metric.source],
              signal: controller.signal,
              deadlineAt,
            });
            if (observation === null) return [metric, { ok: false, reason: `nessuna osservazione entro il ${requestedDate}` }];
            return [metric, { ok: true, period: observation.period, value: observation.value }];
          } catch (error) {
            const reason = error instanceof SourceError ? error.message : ((error as { message?: string })?.message ?? "errore di rete");
            return [metric, { ok: false, reason }];
          }
        }),
        CONCURRENCY,
      );
      for (const [metric, outcome] of outcomes) {
        resolved.set(
          metric.id,
          outcome.ok
            ? live(metric, requestedDate, retrievedAt, outcome.period, outcome.value)
            : fromSnapshot(metric, snapshotPointFor(metric), requestedDate, retrievedAt, outcome.reason),
        );
      }
    } finally {
      clearTimeout(budget);
    }
  }

  for (const metric of fetchable) {
    if (resolved.has(metric.id)) continue;
    resolved.set(metric.id, fromSnapshot(metric, snapshotPointFor(metric), requestedDate, retrievedAt, options.live ? "tempo disponibile esaurito" : null));
  }

  const fx: Record<string, MarketEntry> = {};
  for (const metric of FX_METRICS) {
    const entry = resolved.get(metric.id);
    if (entry !== undefined) fx[metric.pair] = entry;
  }
  const rates: Record<string, MarketEntry> = {};
  for (const metric of RATE_METRICS) {
    const entry = resolved.get(metric.id);
    if (entry !== undefined) rates[metric.id] = entry;
  }
  const country = countryEntry(requestedDate, retrievedAt);

  const all = [...Object.values(fx), ...Object.values(rates), country];
  const counts: MarketBundleCounts = {
    fxTotal: Object.keys(fx).length,
    fxOk: Object.values(fx).filter((entry) => entry.status === "OK").length,
    ratesTotal: Object.keys(rates).length,
    ratesOk: Object.values(rates).filter((entry) => entry.status === "OK").length,
    live: all.filter((entry) => entry.status === "OK" && entry.cacheStatus === "LIVE").length,
    cached: all.filter((entry) => entry.status === "OK" && entry.cacheStatus !== "LIVE").length,
    unavailable: all.filter((entry) => entry.status === "UNAVAILABLE").length,
  };

  if (counts.unavailable > 0) warnings.push(counts.unavailable === 1 ? `1 serie su ${all.length} non risolta: la voce riporta il motivo.` : `${counts.unavailable} serie su ${all.length} non risolte: le voci riportano il motivo.`);
  const stale = all.filter((entry) => entry.status === "OK" && entry.cacheStatus === "CACHED_STALE").length;
  if (stale > 0) warnings.push(stale === 1 ? `1 valore del dataset congelato del ${SNAPSHOT_DATE} dista dalla data richiesta più della lunghezza del suo periodo: da verificare alla fonte prima dell'uso.` : `${stale} valori del dataset congelato del ${SNAPSHOT_DATE} distano dalla data richiesta più della lunghezza del loro periodo: da verificare alla fonte prima dell'uso.`);

  return { requestedDate, generatedAt: retrievedAt, mode: options.live ? "live" : "snapshot", dataset: DATASET, fx, rates, country, counts, warnings };
}

type Observationish =
  | { readonly ok: true; readonly period: string; readonly value: number }
  | { readonly ok: false; readonly reason: string };

export const FETCHABLE_METRICS = ALL_METRICS.filter((metric) => metric.kind !== "country").length;

export function defaultDate(): string {
  return todayIso();
}
