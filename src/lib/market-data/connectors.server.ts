/**
 * Accesso alle fonti pubbliche, solo lato server.
 *
 * Il browser non interroga mai le fonti direttamente: la richiesta parte da
 * `/api/market-data`. Treasury e' la fonte primaria per la curva CMT USD.
 */
import { lastObservationAtOrBefore, type Observation } from "./as-of";
import { parseEcbCsv, parseFredCsv } from "./csv";
import { ECB_BASE, FRED_CSV, type Metric } from "./registry";
import { parseTreasuryXml, treasuryUrl, type TreasuryObservations, type TreasurySeries } from "./treasury";

const USER_AGENT = "TPbox/1.0 (portale transfer pricing; market data reader)";
const LOOKBACK_DAYS = 420;
export const TREASURY_CACHE_TTL_MS = 15 * 60 * 1000;

type TreasuryCacheEntry = {
  readonly expiresAt: number;
  readonly observations: TreasuryObservations;
};
const treasuryCache = new Map<string, Promise<TreasuryCacheEntry>>();

export class SourceError extends Error {}

function shiftDays(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function shiftMonths(isoDate: string, months: number): string {
  const base = new Date(`${isoDate}T00:00:00Z`);
  base.setUTCMonth(base.getUTCMonth() + months);
  return base.toISOString().slice(0, 10);
}

interface FetchOptions {
  readonly timeoutMs: number;
  readonly signal: AbortSignal | null;
  readonly deadlineAt: number;
}

async function getText(url: string, options: FetchOptions): Promise<string> {
  let lastError = "errore sconosciuto";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/xml,text/csv,*/*" },
        signal: controller.signal,
        redirect: "follow",
      });
      if (response.ok) return await response.text();
      if (response.status === 429 || response.status >= 500) {
        lastError = `HTTP ${response.status}`;
      } else {
        throw new SourceError(`HTTP ${response.status}`);
      }
    } catch (error) {
      if (options.signal?.aborted) throw new SourceError("tempo disponibile esaurito");
      const err = error as { name?: string; message?: string };
      if (err?.name === "AbortError") lastError = "timeout";
      else if (error instanceof SourceError) throw error;
      else lastError = err?.message ?? "errore di rete";
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
    if (Date.now() + options.timeoutMs > options.deadlineAt) break;
  }
  throw new SourceError(lastError);
}

export function ecbUrl(metric: Metric, date: string): string {
  const start = shiftDays(date, -LOOKBACK_DAYS);
  const query = new URLSearchParams({ format: "csvdata", startPeriod: start });
  return `${ECB_BASE}/${metric.flow}/${metric.series}?${query.toString()}`;
}

export function fredUrl(metric: Metric, date: string): string {
  const start = shiftDays(date, -LOOKBACK_DAYS);
  return `${FRED_CSV}${metric.series}&cosd=${start}`;
}

async function treasuryData(url: string, options: FetchOptions): Promise<TreasuryObservations> {
  const now = Date.now();
  const cached = treasuryCache.get(url);
  if (cached) {
    const entry = await cached;
    if (entry.expiresAt > now) return entry.observations;
    treasuryCache.delete(url);
  }

  const pending = getText(url, options).then((text) => ({
    expiresAt: Date.now() + TREASURY_CACHE_TTL_MS,
    observations: parseTreasuryXml(text),
  }));
  treasuryCache.set(url, pending);
  try {
    return (await pending).observations;
  } catch (error) {
    treasuryCache.delete(url);
    throw error;
  }
}

async function fetchTreasuryObservation(
  metric: Metric,
  date: string,
  options: FetchOptions,
): Promise<Observation | null> {
  const series = metric.series as TreasurySeries;
  const current = await treasuryData(treasuryUrl(date), options);
  const observation = lastObservationAtOrBefore(current.get(series) ?? [], date);
  if (observation) return observation;

  // Se la data richiesta e' nei primissimi giorni del mese, la precedente
  // osservazione valida puo' appartenere al mese precedente (weekend/festivita').
  const previous = await treasuryData(treasuryUrl(shiftMonths(date, -1)), options);
  return lastObservationAtOrBefore(previous.get(series) ?? [], date);
}

/** Osservazione della metrica valida alla data richiesta, scaricata dalla fonte. */
export async function fetchObservation(
  metric: Metric,
  date: string,
  options: FetchOptions,
): Promise<Observation | null> {
  if (metric.source === "ECB") {
    const text = await getText(ecbUrl(metric, date), options);
    return lastObservationAtOrBefore(parseEcbCsv(text), date);
  }
  if (metric.source === "FRED") {
    const text = await getText(fredUrl(metric, date), options);
    return lastObservationAtOrBefore(parseFredCsv(text), date);
  }
  if (metric.source === "TREASURY") {
    return fetchTreasuryObservation(metric, date, options);
  }
  throw new SourceError(
    `fonte ${metric.source} non interrogabile dal vivo: il valore arriva dal dataset congelato`,
  );
}

/** Esegue i lavori con un massimo di richieste contemporanee. */
export async function pooled<T>(
  jobs: readonly (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results = new Array<T>(jobs.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      const job = jobs[index];
      if (job === undefined) return;
      results[index] = await job();
    }
  });
  await Promise.all(workers);
  return results;
}
