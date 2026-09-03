/**
 * Motore del Currency-Adjusted Benchmark.
 *
 * Trasforma le osservazioni di un benchmark espresso in una valuta nella valuta
 * di destinazione e ricalcola il range statistico sulla popolazione convertita.
 *
 * Due metodi, entrambi tracciabili:
 *  - differenziale dei tassi di riferimento: metrica target = metrica origine +
 *    (tasso di riferimento della valuta target − tasso della valuta di origine),
 *    con i due tassi presi dallo stesso snapshot di mercato;
 *  - aggiustamento manuale in basis point, deciso dall'analista.
 *
 * Il differenziale si applica ai tassi complessivi (rendimento, coupon, tasso di
 * finanziamento). Non si applica a uno spread creditizio ne' a un cross-currency
 * basis: in quei casi il differenziale è già incorporato nel tasso base della
 * valuta e sommarlo lo conterebbe due volte.
 */
import type {
  ConversionSettings,
  MetricType,
  MetricUnit,
  Observation,
  RangeStats,
  RowResult,
} from "./types";

export const ENGINE_VERSION = "currency-benchmark-engine.v1";

const DIFFERENTIAL_METRIC_TYPES: readonly MetricType[] = ["yield", "coupon", "lending_rate"];

export const METRIC_TYPE_LABELS: Readonly<Record<MetricType, string>> = {
  yield: "Rendimento (yield)",
  coupon: "Coupon",
  lending_rate: "Tasso di finanziamento",
  credit_spread: "Spread creditizio",
  xccy_basis: "Cross-currency basis",
  other: "Altro",
};

export const METHOD_LABELS = {
  IDENTITY: "Nessuna conversione",
  RATE_DIFFERENTIAL: "Differenziale dei tassi di riferimento",
  MANUAL_ADJUSTMENT: "Aggiustamento manuale",
} as const;

/** Valore dell'osservazione in punti percentuali, qualunque sia l'unita' inserita. */
export function toPercent(value: number, unit: MetricUnit): number {
  return unit === "bps" ? value / 100 : value;
}

export function toBasisPoints(percent: number): number {
  return percent * 100;
}

function error(warning: string): RowResult {
  return {
    status: "ERROR",
    sourcePercent: null,
    targetPercent: null,
    targetBp: null,
    deltaBp: null,
    method: null,
    basis: "—",
    warning,
  };
}

function blocked(sourcePercent: number, warning: string): RowResult {
  return {
    status: "BLOCKED",
    sourcePercent,
    targetPercent: null,
    targetBp: null,
    deltaBp: null,
    method: null,
    basis: "—",
    warning,
  };
}

export function convert(observation: Observation, settings: ConversionSettings): RowResult {
  if (observation.value === null || !Number.isFinite(observation.value)) {
    return error("valore non leggibile");
  }
  const sourcePercent = toPercent(observation.value, settings.metricUnit);

  if (settings.sourceCurrency === settings.targetCurrency) {
    return {
      status: "VALID",
      sourcePercent,
      targetPercent: sourcePercent,
      targetBp: toBasisPoints(sourcePercent),
      deltaBp: 0,
      method: "IDENTITY",
      basis: "valuta di origine e di destinazione coincidono",
      warning: null,
    };
  }

  if (settings.method === "MANUAL_ADJUSTMENT") {
    const basisBp = settings.manualBasisBp;
    if (basisBp === null || !Number.isFinite(basisBp)) {
      return error("aggiustamento manuale non valido");
    }
    const target = sourcePercent + basisBp / 100;
    return {
      status: "VALID",
      sourcePercent,
      targetPercent: target,
      targetBp: toBasisPoints(target),
      deltaBp: basisBp,
      method: "MANUAL_ADJUSTMENT",
      basis: `aggiustamento manuale di ${basisBp.toFixed(2)} bp deciso dall'analista`,
      warning: null,
    };
  }

  if (settings.metricType === "other") {
    return blocked(
      sourcePercent,
      "metrica di tipo «Altro»: nessuna conversione automatica, usare l'aggiustamento manuale",
    );
  }
  if (!DIFFERENTIAL_METRIC_TYPES.includes(settings.metricType)) {
    return blocked(
      sourcePercent,
      `il differenziale dei tassi non si applica a «${METRIC_TYPE_LABELS[settings.metricType]}»: il differenziale è già incorporato nel tasso base della valuta`,
    );
  }
  const differential = settings.differential;
  if (differential === null) {
    return blocked(
      sourcePercent,
      settings.differentialBlockedReason ??
        "differenziale non disponibile per questa coppia e questo tenor",
    );
  }

  const target = sourcePercent + differential.deltaBp / 100;
  return {
    status: "VALID",
    sourcePercent,
    targetPercent: target,
    targetBp: toBasisPoints(target),
    deltaBp: differential.deltaBp,
    method: "RATE_DIFFERENTIAL",
    basis:
      `${differential.targetLeg.label} ${differential.targetLeg.value.toFixed(4)}% ` +
      `(${differential.targetLeg.asOf}) − ${differential.sourceLeg.label} ` +
      `${differential.sourceLeg.value.toFixed(4)}% (${differential.sourceLeg.asOf})`,
    warning: differential.asOfMismatch
      ? "i due tassi di riferimento hanno date diverse: verificare la comparabilità temporale"
      : null,
  };
}

/** Percentile con interpolazione lineare, la convenzione usata nei benchmark TP. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower];
  const high = sorted[upper];
  if (low === undefined || high === undefined) return null;
  if (lower === upper) return low;
  return low + (high - low) * (position - lower);
}

export function rangeStats(values: readonly number[]): RangeStats | null {
  const usable = values.filter((value) => Number.isFinite(value));
  if (usable.length === 0) return null;
  const min = percentile(usable, 0);
  const q1 = percentile(usable, 0.25);
  const median = percentile(usable, 0.5);
  const q3 = percentile(usable, 0.75);
  const max = percentile(usable, 1);
  if (min === null || q1 === null || median === null || q3 === null || max === null) return null;
  return { count: usable.length, min, q1, median, q3, max };
}

/** Decimali fissi: in una tabella di comparabili le cifre devono incolonnarsi. */
export function formatPercent(value: number, decimals = 4): string {
  return `${value.toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

export function formatBp(value: number, decimals = 1): string {
  return `${value.toLocaleString("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: decimals,
  })} bp`;
}

export function formatSignedBp(value: number, decimals = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatBp(value, decimals)}`;
}

export interface CsvContext {
  readonly settings: ConversionSettings;
  readonly datasetVersion: string;
  readonly requestedDate: string;
  readonly generatedAt: string;
}

const CSV_HEADER: readonly string[] = [
  "Comparable ID",
  "Metrica origine",
  "Unità inserita",
  "Tipo metrica",
  "Valuta origine",
  "Valuta target",
  "Tenor",
  "Metrica origine (%)",
  "Metrica target (%)",
  "Metrica target (bp)",
  "Delta (bp)",
  "Metodo",
  "Base di calcolo",
  "Stato",
  "Avviso",
  "Tasso origine",
  "Tasso origine as of",
  "Tasso origine fonte",
  "Tasso target",
  "Tasso target as of",
  "Tasso target fonte",
  "Stato dato",
  "Data di riferimento",
  "Dataset",
  "Motore",
  "Generato il",
];

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(
  rows: readonly { readonly observation: Observation; readonly result: RowResult }[],
  context: CsvContext,
): string {
  const { settings } = context;
  const differential = settings.differential;
  const lines = [CSV_HEADER.map(csvCell).join(";")];
  for (const { observation, result } of rows) {
    lines.push(
      [
        observation.id,
        observation.raw,
        settings.metricUnit,
        METRIC_TYPE_LABELS[settings.metricType],
        settings.sourceCurrency,
        settings.targetCurrency,
        settings.tenor,
        result.sourcePercent,
        result.targetPercent,
        result.targetBp,
        result.deltaBp,
        result.method === null ? "" : METHOD_LABELS[result.method],
        result.basis,
        result.status,
        result.warning,
        differential?.sourceLeg.value ?? null,
        differential?.sourceLeg.asOf ?? null,
        differential?.sourceLeg.series ?? null,
        differential?.targetLeg.value ?? null,
        differential?.targetLeg.asOf ?? null,
        differential?.targetLeg.series ?? null,
        differential?.targetLeg.cacheStatus ?? null,
        context.requestedDate,
        context.datasetVersion,
        ENGINE_VERSION,
        context.generatedAt,
      ]
        .map(csvCell)
        .join(";"),
    );
  }
  return lines.join("\r\n");
}
