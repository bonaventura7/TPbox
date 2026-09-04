/**
 * Convenzioni di calcolo dei giorni.
 *
 * Le regole seguono le ISDA 2006 Definitions, Section 4.16: bond basis alla
 * lettera (f), Eurobond basis alla (g), ACT/ACT nella variante ISDA alla (b).
 * Tutte le date sono ISO YYYY-MM-DD e vengono lette in UTC, cosi' il fuso
 * orario del browser non sposta mai un giorno di calendario.
 */

import type { DayCountId } from "./types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Legge una data ISO in UTC, rifiutando le date inesistenti come il 30 febbraio. */
export function parseIsoDate(iso: string): Date | null {
  if (!ISO.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

export function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

const MS_PER_DAY = 86_400_000;

/** Giorni di calendario effettivi fra due date ISO. */
export function dayCount(startIso: string, endIso: string): number {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (start === null || end === null) return 0;
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

function thirty360(start: Date, end: Date, european: boolean): number {
  const y1 = start.getUTCFullYear();
  const m1 = start.getUTCMonth() + 1;
  const y2 = end.getUTCFullYear();
  const m2 = end.getUTCMonth() + 1;
  let d1 = start.getUTCDate();
  let d2 = end.getUTCDate();

  if (european) {
    if (d1 === 31) d1 = 30;
    if (d2 === 31) d2 = 30;
  } else {
    if (d1 === 31) d1 = 30;
    if (d2 === 31 && d1 === 30) d2 = 30;
  }

  return (360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1)) / 360;
}

/**
 * ACT/ACT ISDA: il periodo si spezza sui confini d'anno e ogni frammento va
 * diviso per la lunghezza del proprio anno, cosi' un anno bisestile pesa 366.
 */
function actActIsda(start: Date, end: Date): number {
  let total = 0;
  let cursor = start;
  while (cursor < end) {
    const year = cursor.getUTCFullYear();
    const nextYear = new Date(Date.UTC(year + 1, 0, 1));
    const segmentEnd = nextYear < end ? nextYear : end;
    const days = Math.round((segmentEnd.getTime() - cursor.getTime()) / MS_PER_DAY);
    total += days / daysInYear(year);
    cursor = segmentEnd;
  }
  return total;
}

/** Frazione d'anno fra due date secondo la convenzione indicata. */
export function yearFraction(convention: DayCountId, startIso: string, endIso: string): number {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (start === null || end === null) return 0;
  if (end <= start) return 0;

  switch (convention) {
    case "30/360":
      return thirty360(start, end, false);
    case "30E/360":
      return thirty360(start, end, true);
    case "ACT/360":
      return dayCount(startIso, endIso) / 360;
    case "ACT/365":
      return dayCount(startIso, endIso) / 365;
    case "ACT/ACT":
      return actActIsda(start, end);
  }
}

export const DAY_COUNT_LABELS: Record<DayCountId, string> = {
  "30/360": "30/360 (bond basis)",
  "30E/360": "30E/360 (Eurobond basis)",
  "ACT/360": "ACT/360",
  "ACT/365": "ACT/365 (fixed)",
  "ACT/ACT": "ACT/ACT (ISDA)",
};

export const DAY_COUNTS: readonly DayCountId[] = [
  "30/360",
  "30E/360",
  "ACT/360",
  "ACT/365",
  "ACT/ACT",
];
