/**
 * Scadenzario dei pagamenti.
 *
 * Le date si generano all'indietro dalla scadenza, come nella prassi di
 * mercato: il roll day e' quello della scadenza e l'eventuale periodo
 * irregolare cade in testa (front stub). Quando la scadenza e' l'ultimo giorno
 * del mese vale la regola di fine mese e tutte le date rollano a fine mese.
 *
 * Le date non vengono aggiustate per i giorni lavorativi: senza un calendario
 * TARGET o locale l'aggiustamento sarebbe una convenzione inventata dal tool.
 * L'assenza e' dichiarata negli avvisi del risultato.
 */

import { daysInYear, parseIsoDate, toIso } from "./daycount";
import type { PayFrequencyId, SchedulePeriod } from "./types";

export const FREQUENCY_MONTHS: Record<PayFrequencyId, number> = {
  ANNUAL: 12,
  SEMI_ANNUAL: 6,
  QUARTERLY: 3,
  MONTHLY: 1,
};

export const FREQUENCY_LABELS: Record<PayFrequencyId, string> = {
  ANNUAL: "Annual",
  SEMI_ANNUAL: "Semi-annual",
  QUARTERLY: "Quarterly",
  MONTHLY: "Monthly",
};

export const PAY_FREQUENCIES: readonly PayFrequencyId[] = [
  "ANNUAL",
  "SEMI_ANNUAL",
  "QUARTERLY",
  "MONTHLY",
];

/** Numero di pagamenti all'anno, per il calcolo del tasso periodale. */
export function periodsPerYear(frequency: PayFrequencyId): number {
  return 12 / FREQUENCY_MONTHS[frequency];
}

function daysInMonth(year: number, monthIndex: number): number {
  if (monthIndex === 1) return daysInYear(year) === 366 ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][monthIndex]!;
}

function isEndOfMonth(date: Date): boolean {
  return date.getUTCDate() === daysInMonth(date.getUTCFullYear(), date.getUTCMonth());
}

/**
 * Somma mesi a una data. Con `endOfMonth` la data risultante e' sempre
 * l'ultimo giorno del mese; senza, il giorno viene arretrato solo se non
 * esiste nel mese di arrivo (31 gennaio + 1 mese = 28 febbraio).
 */
function addMonths(date: Date, months: number, endOfMonth: boolean): Date {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const monthIndex = ((total % 12) + 12) % 12;
  const last = daysInMonth(year, monthIndex);
  const day = endOfMonth ? last : Math.min(date.getUTCDate(), last);
  return new Date(Date.UTC(year, monthIndex, day));
}

/** Scadenza ricavata dalla data di decorrenza e da un tenor espresso in mesi. */
export function maturityFromTenor(effectiveIso: string, months: number): string | null {
  const effective = parseIsoDate(effectiveIso);
  if (effective === null || !Number.isFinite(months) || months <= 0) return null;
  return toIso(addMonths(effective, Math.round(months), false));
}

/** Numero massimo di periodi generabili: cento anni a cadenza mensile. */
const MAX_PERIODS = 1200;

export function buildSchedule(
  effectiveIso: string,
  maturityIso: string,
  frequency: PayFrequencyId,
): readonly SchedulePeriod[] {
  const effective = parseIsoDate(effectiveIso);
  const maturity = parseIsoDate(maturityIso);
  if (effective === null || maturity === null || maturity <= effective) return [];

  const step = FREQUENCY_MONTHS[frequency];
  const endOfMonth = isEndOfMonth(maturity);

  // All'indietro dalla scadenza, sempre ricalcolando dalla scadenza stessa:
  // sommare mese su mese al periodo precedente accumulerebbe deriva.
  const boundaries: Date[] = [maturity];
  for (let k = 1; k <= MAX_PERIODS; k += 1) {
    const boundary = addMonths(maturity, -k * step, endOfMonth);
    boundaries.push(boundary);
    if (boundary <= effective) break;
  }
  boundaries.reverse();

  // Il primo confine cade sulla decorrenza o prima: in questo secondo caso il
  // periodo di testa e' irregolare e parte dalla decorrenza.
  const first = boundaries[0]!;
  const stub = first.getTime() !== effective.getTime();
  const dates = boundaries.map(toIso);
  dates[0] = effectiveIso;

  const periods: SchedulePeriod[] = [];
  for (let i = 0; i < dates.length - 1; i += 1) {
    periods.push({
      index: i + 1,
      startDate: dates[i]!,
      endDate: dates[i + 1]!,
      stub: i === 0 && stub,
    });
  }
  return periods;
}
