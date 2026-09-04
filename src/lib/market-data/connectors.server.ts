/**
 * Accesso alle fonti pubbliche, solo lato server.
 *
 * Nessuna chiave API: BCE SDMX e FRED espongono CSV pubblici, il Tesoro USA un
 * feed XML pubblico. Il browser non interroga mai le fonti direttamente (la
 * richiesta parte da `/api/market-data`).
 *
 * Ogni chiamata ha timeout proprio, un tentativo di ripetizione sui soli errori
 * ripetibili (429, 5xx, rete) e una finestra temporale ristretta: si scaricano
 * gli ultimi mesi, non l'intera storia della serie.
 */
import { lastObservationAtOrBefore, type Observation } from "./as-of";
import { parseEcbCsv, parseFredCsv } from "./csv";
import { ECB_BASE, FRED_CSV, type Metric } from "./registry";
import { parseTreasuryXml, previousMonthKey, treasuryFeedUrl, treasuryMonthKey } from "./treasury";

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
  /** Istante oltre il quale non si ritenta: la funzione ha un tetto di durata. */
  readonly deadlineAt: number;
  /** Tipo di risposta atteso: CSV per BCE e FRED, XML per il Tesoro. */
  readonly accept?: string;
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
        headers: {
          "User-Agent": USER_AGENT,
          Accept: options.accept ?? "text/csv,*/*",
        },
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
    // Un secondo tentativo si fa solo se resta tempo per completarlo.
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
  // `cosd` restringe la finestra sul grafico FRED; se venisse ignorato si
  // scarica piu' storia del necessario, non un dato diverso.
  const start = shiftDays(date, -LOOKBACK_DAYS);
  return `${FRED_CSV}${metric.series}&cosd=${start}`;
}

type TreasuryMonth = Readonly<Record<string, readonly Observation[]>>;

/**
 * Il feed del Tesoro pubblica un mese per volta con tutte le scadenze sulla
 * stessa riga: le otto metriche della curva in dollari leggono lo stesso
 * documento. La promessa viene condivisa per non scaricare otto volte lo stesso
 * mese, e resta valida quanto la cache della rotta (un quarto d'ora).
 *
 * Se la richiesta fallisce la voce viene tolta, cosi' la metrica successiva
 * riprova invece di ereditare l'errore per tutta la finestra di validita'.
 */
const treasuryMonths = new Map<
  string,
  { readonly at: number; readonly data: Promise<TreasuryMonth> }
>();
const TREASURY_MONTH_TTL_MS = 900_000;
const TREASURY_ACCEPT = "application/xml,text/xml,*/*";

/** Svuota la memoria dei mesi: serve ai test e al riuso dell'istanza. */
export function clearTreasuryMonths(): void {
  treasuryMonths.clear();
}

function loadTreasuryMonth(monthKey: string, options: FetchOptions): Promise<TreasuryMonth> {
  const cached = treasuryMonths.get(monthKey);
  if (cached !== undefined && Date.now() - cached.at < TREASURY_MONTH_TTL_MS) return cached.data;
  const data = getText(treasuryFeedUrl(monthKey), { ...options, accept: TREASURY_ACCEPT })
    .then(parseTreasuryXml)
    .catch((error: unknown) => {
      treasuryMonths.delete(monthKey);
      throw error;
    });
  treasuryMonths.set(monthKey, { at: Date.now(), data });
  return data;
}

/**
 * Osservazione della curva del Tesoro valida alla data richiesta.
 *
 * Il mese pubblicato e' quello della data; quando non contiene ancora
 * osservazioni utili — primo del mese, festivita' statunitense, pubblicazione il
 * giorno lavorativo successivo — si legge il mese precedente. Al massimo due
 * richieste, e la seconda solo quando serve.
 */
async function treasuryObservation(
  field: string,
  date: string,
  options: FetchOptions,
): Promise<Observation | null> {
  const monthKey = treasuryMonthKey(date);
  const current = (await loadTreasuryMonth(monthKey, options))[field];
  const found = current === undefined ? null : lastObservationAtOrBefore(current, date);
  if (found !== null) return found;
  const earlier = (await loadTreasuryMonth(previousMonthKey(monthKey), options))[field];
  return earlier === undefined ? null : lastObservationAtOrBefore(earlier, date);
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
  if (metric.source === "TREASURY") {
    return treasuryObservation(metric.series, date, options);
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
