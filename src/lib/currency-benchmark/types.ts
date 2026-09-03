import type { CacheStatus } from "../market-data/types";
import type { TenorId } from "../market-data/registry";

export type MetricType =
  "yield" | "coupon" | "lending_rate" | "credit_spread" | "xccy_basis" | "other";

export type MetricUnit = "percent" | "bps";

/**
 * IDENTITY            valuta di origine e di destinazione coincidono
 * RATE_DIFFERENTIAL   differenziale fra i tassi di riferimento delle due valute
 * MANUAL_ADJUSTMENT   aggiustamento in basis point inserito dall'analista
 */
export type MethodId = "IDENTITY" | "RATE_DIFFERENTIAL" | "MANUAL_ADJUSTMENT";

/** Tasso di riferimento di una valuta, con la sua provenienza. */
export interface RateLeg {
  readonly currency: string;
  readonly metricId: string;
  readonly label: string;
  readonly value: number;
  readonly asOf: string;
  readonly source: string;
  readonly series: string;
  readonly sourceUrl: string;
  readonly cacheStatus: CacheStatus;
  readonly verified: boolean;
}

export interface Differential {
  readonly sourceLeg: RateLeg;
  readonly targetLeg: RateLeg;
  /** Differenza target − origine, in basis point. */
  readonly deltaBp: number;
  readonly asOfMismatch: boolean;
}

export interface ConversionSettings {
  readonly sourceCurrency: string;
  readonly targetCurrency: string;
  readonly tenor: TenorId;
  readonly metricUnit: MetricUnit;
  readonly metricType: MetricType;
  readonly method: MethodId;
  readonly manualBasisBp: number | null;
  readonly differential: Differential | null;
  /** Motivo per cui il differenziale non e' disponibile, quando manca. */
  readonly differentialBlockedReason: string | null;
}

export type RowStatus = "VALID" | "BLOCKED" | "ERROR";

export interface RowResult {
  readonly status: RowStatus;
  readonly sourcePercent: number | null;
  readonly targetPercent: number | null;
  readonly targetBp: number | null;
  readonly deltaBp: number | null;
  readonly method: MethodId | null;
  /** Descrizione sintetica della base di calcolo, per l'audit trail. */
  readonly basis: string;
  readonly warning: string | null;
}

export interface Observation {
  readonly id: string;
  readonly raw: string;
  readonly value: number | null;
}

export interface RangeStats {
  readonly count: number;
  readonly min: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly max: number;
}
