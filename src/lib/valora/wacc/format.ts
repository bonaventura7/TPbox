/**
 * Formattazione di sola presentazione: il motore non arrotonda,
 * l'arrotondamento avviene esclusivamente qui.
 */

const PERCENT = new Intl.NumberFormat("it-IT", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DECIMAL_3 = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const DECIMAL_2 = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBpAsPercent(valueBp: number): string {
  if (!Number.isFinite(valueBp)) return "non disponibile";
  return PERCENT.format(valueBp / 10000);
}

export function formatRatio(value: number): string {
  if (!Number.isFinite(value)) return "non disponibile";
  return PERCENT.format(value);
}

export function formatBeta(betaMilli: number): string {
  if (!Number.isFinite(betaMilli)) return "non disponibile";
  return DECIMAL_3.format(betaMilli / 1000);
}

export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "non disponibile";
  return DECIMAL_2.format(value);
}

/** Rapporti non percentuali, come D/E. */
export function formatMultiple(value: number): string {
  if (!Number.isFinite(value)) return "non disponibile";
  return DECIMAL_3.format(value);
}

const DATE_TIME = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});

export function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? "non disponibile" : DATE_TIME.format(parsed);
}
