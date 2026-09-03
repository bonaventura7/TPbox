/**
 * Accesso alle fonti pubbliche, solo lato server.
 *
 * Nessuna chiave API: BCE SDMX e FRED espongono CSV pubblici. Il browser non
 * interroga mai le fonti direttamente (la richiesta parte da `/api/market-data`).
 *
 * Ogni chiamata ha timeout proprio, un tentativo di ripetizione sui soli errori
 * ripetibili (429, 5xx, rete) e una finestra temporale ristretta: si scaricano
 * gli ultimi mesi, non l'intera storia della serie.
 */
import { lastObservationAtOrBefore, type Observation } from "./as-of";
import { parseEcbCsv, parseFredCsv } from "./csv";
import { ECB_BASE, FRED_CSV, type Metric } from "./registry";

const USER_AGENT = "TPbox/1.0 (portale transfer pricing; market data reader)";
/** Storia scaricata prima della data richiesta: copre anche le serie mensili. */
const LOOKBACK_DAYS = 420;

export class SourceError extends Error {}

function shiftDays(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

interface FetchOptions {
  readonly timeoutMs: number;
  readonly signal: AbortSignal | null;
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
        headers: { "User-Agent": USER_AGENT, Accept: "text/csv,*/*" },
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
  }
  throw new SourceError(lastError);
}

export function ecbUrl(metric: Metric, date: string): string {
  const start = shiftDays(date, -LOOKBACK_DAYS);
  const query = new URLSearchParams({ format: "csvdata", startPeriod: start });
  return `${ECB_BASE}/${metric.flow}/${metric.series}?${query.toString()}`;
}

export function fredUrl(metric: Metric, date: string): string {
  // `cosd` restringe la finestra sul grafico FRED; se venisse ignorato si
  // scarica piu' storia del necessario, non un dato diverso.
  const start = shiftDays(date, -LOOKBACK_DAYS);
  return `${FRED_CSV}${metric.series}&cosd=${start}`;
}

/**
 * Osservazione della metrica valida alla data richiesta, scaricata dalla fonte.
 * `null` se la serie risponde ma non ha osservazioni entro la data.
 */
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
