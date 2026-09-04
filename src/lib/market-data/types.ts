/**
 * Contratto dei dati di mercato.
 *
 * Ogni valore porta con se' la provenienza completa: fonte, serie, url, data di
 * riferimento del dato (`asOf`), data richiesta e stato della cache. Un valore
 * che non si riesce a risolvere non viene mai sostituito da una stima: diventa
 * una voce `UNAVAILABLE` con il motivo.
 */

export type MarketSource = "ECB" | "FRED" | "TREASURY" | "DAMODARAN";

export type MetricKind = "fx" | "rate" | "country";

/**
 * LIVE        valore appena scaricato dalla fonte
 * CACHED      valore preso dallo snapshot congelato nel repository, con
 *             `asOf` non successivo alla data richiesta
 * CACHED_STALE valore dello snapshot congelato usato oltre la sua finestra di
 *             validita' naturale (fonte irraggiungibile): da verificare a mano
 */
export type CacheStatus = "LIVE" | "CACHED" | "CACHED_STALE";

/** Provenienza comune a valori risolti e a mancanze. */
export interface EntryProvenance {
  readonly metricId: string;
  readonly label: string;
  readonly requestedDate: string;
  readonly unit: string;
  readonly source: MarketSource;
  readonly series: string;
  readonly sourceUrl: string;
  readonly retrievedAt: string;
}

export interface ResolvedEntry extends EntryProvenance {
  readonly status: "OK";
  readonly value: number;
  /** Data (o periodo: `2026-08`, `2026-Q2`) dell'osservazione usata. */
  readonly asOf: string;
  readonly cacheStatus: CacheStatus;
  /** Data dello snapshot congelato, quando il valore non e' LIVE. */
  readonly snapshotDate: string | null;
}

export interface MissingEntry extends EntryProvenance {
  readonly status: "UNAVAILABLE";
  readonly reason: string;
}

export type MarketEntry = ResolvedEntry | MissingEntry;

export function isResolved(entry: MarketEntry | undefined): entry is ResolvedEntry {
  return entry !== undefined && entry.status === "OK";
}

/** Country risk premium di un paese secondo il dataset Damodaran (NYU Stern). */
export interface CountryRisk {
  readonly country: string;
  readonly ratingMoodys: string;
  /** Frazioni, non percentuali: 0.01618 = 1,618%. */
  readonly defaultSpread: number;
  readonly totalErp: number;
  readonly countryRiskPremium: number;
  readonly cds10y: number | null;
}

export interface ResolvedCountryEntry extends EntryProvenance {
  readonly status: "OK";
  readonly data: CountryRisk;
  readonly asOf: string;
  readonly cacheStatus: CacheStatus;
  readonly snapshotDate: string | null;
}

export type CountryEntry = ResolvedCountryEntry | MissingEntry;

export interface DatasetProvenance {
  readonly version: string;
  readonly snapshotDate: string;
  readonly builtAt: string;
  /** Hash dello snapshot di origine (backend TP Market Data). */
  readonly originHash: string;
}

export interface MarketBundleCounts {
  readonly fxTotal: number;
  readonly fxOk: number;
  readonly ratesTotal: number;
  readonly ratesOk: number;
  readonly live: number;
  readonly cached: number;
  readonly unavailable: number;
}

/** Risposta di `/api/market-data`. */
export interface MarketBundle {
  readonly requestedDate: string;
  readonly generatedAt: string;
  readonly mode: "live" | "snapshot";
  readonly dataset: DatasetProvenance;
  readonly fx: Readonly<Record<string, MarketEntry>>;
  readonly rates: Readonly<Record<string, MarketEntry>>;
  readonly country: CountryEntry;
  readonly counts: MarketBundleCounts;
  /** Avvisi non bloccanti (fonti lente, valori fuori finestra, ...). */
  readonly warnings: readonly string[];
}
