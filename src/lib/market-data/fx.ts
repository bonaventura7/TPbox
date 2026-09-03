/**
 * Cambio per una coppia qualsiasi a partire dai tassi di riferimento BCE, che
 * sono tutti espressi contro euro.
 *
 * EUR/GBP arriva dalla serie diretta, GBP/EUR dal suo reciproco, USD/GBP dal
 * rapporto fra EUR/GBP e EUR/USD della stessa data. Il calcolo e' dichiarato
 * nel risultato insieme alle serie usate: nessun cambio arriva da altra fonte.
 */
import { isResolved, type CacheStatus, type MarketEntry, type ResolvedEntry } from "./types";

export type FxMethod = "IDENTITY" | "DIRECT" | "INVERSE" | "CROSS";

export interface FxQuote {
  readonly status: "OK";
  readonly pair: string;
  readonly value: number;
  readonly asOf: string;
  readonly method: FxMethod;
  readonly cacheStatus: CacheStatus;
  readonly legs: readonly ResolvedEntry[];
  /** `true` se le due gambe del cross hanno date diverse. */
  readonly asOfMismatch: boolean;
}

export interface FxMiss {
  readonly status: "UNAVAILABLE";
  readonly pair: string;
  readonly reason: string;
}

export type FxResolution = FxQuote | FxMiss;

const SEVERITY: Record<CacheStatus, number> = { LIVE: 0, CACHED: 1, CACHED_STALE: 2 };

function weakest(legs: readonly ResolvedEntry[]): CacheStatus {
  return legs.reduce<CacheStatus>(
    (worst, leg) => (SEVERITY[leg.cacheStatus] > SEVERITY[worst] ? leg.cacheStatus : worst),
    "LIVE",
  );
}

function leg(
  fx: Readonly<Record<string, MarketEntry>>,
  currency: string,
): ResolvedEntry | { readonly reason: string } {
  const pair = `EUR/${currency}`;
  const entry = fx[pair];
  if (entry === undefined) {
    return { reason: `la coppia ${pair} non è nel registry dei cambi di riferimento BCE` };
  }
  if (!isResolved(entry)) {
    return { reason: `${pair} non risolta: ${entry.reason}` };
  }
  return entry;
}

export function resolveFxPair(
  fx: Readonly<Record<string, MarketEntry>>,
  from: string,
  to: string,
): FxResolution {
  const source = from.toUpperCase();
  const target = to.toUpperCase();
  const pair = `${source}/${target}`;

  if (source === target) {
    return {
      status: "OK",
      pair,
      value: 1,
      asOf: "—",
      method: "IDENTITY",
      cacheStatus: "LIVE",
      legs: [],
      asOfMismatch: false,
    };
  }

  if (source === "EUR") {
    const direct = leg(fx, target);
    if (!("status" in direct)) return { status: "UNAVAILABLE", pair, reason: direct.reason };
    return {
      status: "OK",
      pair,
      value: direct.value,
      asOf: direct.asOf,
      method: "DIRECT",
      cacheStatus: direct.cacheStatus,
      legs: [direct],
      asOfMismatch: false,
    };
  }

  if (target === "EUR") {
    const inverse = leg(fx, source);
    if (!("status" in inverse)) return { status: "UNAVAILABLE", pair, reason: inverse.reason };
    if (inverse.value === 0) {
      return {
        status: "UNAVAILABLE",
        pair,
        reason: `EUR/${source} vale zero: reciproco non calcolabile`,
      };
    }
    return {
      status: "OK",
      pair,
      value: 1 / inverse.value,
      asOf: inverse.asOf,
      method: "INVERSE",
      cacheStatus: inverse.cacheStatus,
      legs: [inverse],
      asOfMismatch: false,
    };
  }

  const base = leg(fx, source);
  const quote = leg(fx, target);
  if (!("status" in base)) return { status: "UNAVAILABLE", pair, reason: base.reason };
  if (!("status" in quote)) return { status: "UNAVAILABLE", pair, reason: quote.reason };
  if (base.value === 0) {
    return {
      status: "UNAVAILABLE",
      pair,
      reason: `EUR/${source} vale zero: cross non calcolabile`,
    };
  }
  return {
    status: "OK",
    pair,
    value: quote.value / base.value,
    asOf: base.asOf === quote.asOf ? base.asOf : `${base.asOf} / ${quote.asOf}`,
    method: "CROSS",
    cacheStatus: weakest([base, quote]),
    legs: [base, quote],
    asOfMismatch: base.asOf !== quote.asOf,
  };
}
