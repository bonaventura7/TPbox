/**
 * Semantica as-of dei periodi.
 *
 * Le serie non hanno tutte la stessa frequenza: i cambi BCE sono giornalieri
 * (`2026-09-03`), le medie Euribor sono mensili (`2026-08`) o trimestrali
 * (`2026-Q2`). Un'osservazione di periodo e' disponibile solo quando il periodo
 * e' chiuso: la media di agosto non esiste il 1° agosto. Il confronto va quindi
 * fatto sull'ultimo giorno del periodo, non sulla stringa (`2026-Q2` sarebbe
 * lessicograficamente maggiore di `2026-09-03`).
 */

export interface Observation {
  readonly period: string;
  readonly value: number;
}

/** Ultimo giorno del periodo, come tripletta [anno, mese, giorno]. */
export type PeriodEnd = readonly [number, number, number];

export class PeriodFormatError extends Error {}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function periodEnd(period: string): PeriodEnd {
  const raw = period.trim();
  const yearOnly = /^(\d{4})$/.exec(raw);
  if (yearOnly?.[1]) return [Number(yearOnly[1]), 12, 31];

  const quarter = /^(\d{4})-Q([1-4])$/.exec(raw);
  if (quarter?.[1] && quarter[2]) {
    const year = Number(quarter[1]);
    const month = Number(quarter[2]) * 3;
    return [year, month, daysInMonth(year, month)];
  }

  const semester = /^(\d{4})-S([12])$/.exec(raw);
  if (semester?.[1] && semester[2]) {
    const year = Number(semester[1]);
    const month = Number(semester[2]) * 6;
    return [year, month, daysInMonth(year, month)];
  }

  const month = /^(\d{4})-(\d{2})$/.exec(raw);
  if (month?.[1] && month[2]) {
    const year = Number(month[1]);
    const m = Number(month[2]);
    if (m < 1 || m > 12) throw new PeriodFormatError(`mese non valido: ${raw}`);
    return [year, m, daysInMonth(year, m)];
  }

  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (day?.[1] && day[2] && day[3]) {
    const m = Number(day[2]);
    const d = Number(day[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) {
      throw new PeriodFormatError(`data non valida: ${raw}`);
    }
    return [Number(day[1]), m, d];
  }

  throw new PeriodFormatError(`periodo non riconosciuto: ${raw}`);
}

export function comparePeriodEnd(a: PeriodEnd, b: PeriodEnd): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** `true` se il periodo `period` e' chiuso entro la data `date` (ISO). */
export function isAvailableAt(period: string, date: string): boolean {
  return comparePeriodEnd(periodEnd(period), periodEnd(date)) <= 0;
}

/**
 * Ultima osservazione il cui periodo e' chiuso entro `date`.
 * `null` se nessuna osservazione soddisfa la condizione.
 */
export function lastObservationAtOrBefore(
  observations: readonly Observation[],
  date: string,
): Observation | null {
  const limit = periodEnd(date);
  let best: Observation | null = null;
  let bestEnd: PeriodEnd | null = null;
  for (const observation of observations) {
    let end: PeriodEnd;
    try {
      end = periodEnd(observation.period);
    } catch {
      continue;
    }
    if (comparePeriodEnd(end, limit) > 0) continue;
    if (bestEnd === null || comparePeriodEnd(end, bestEnd) >= 0) {
      best = observation;
      bestEnd = end;
    }
  }
  return best;
}

/** Data odierna in formato ISO (UTC). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
