/**
 * Formattazione dei numeri dei dati di mercato, con la convenzione italiana.
 * Vive in un modulo separato dai componenti per non spezzare il fast refresh.
 */
import type { CacheStatus } from "@/lib/market-data/types";

export type StatusKey = CacheStatus | "UNAVAILABLE";

export function statusKeyOf(
  entry:
    | { readonly status: "OK"; readonly cacheStatus: CacheStatus }
    | { readonly status: "UNAVAILABLE" },
): StatusKey {
  return entry.status === "OK" ? entry.cacheStatus : "UNAVAILABLE";
}

export function formatNumber(value: number, minimum = 2, maximum = 6): string {
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: minimum,
    maximumFractionDigits: maximum,
  });
}

/** Tassi con quattro decimali fissi: le colonne restano incolonnate. */
export function formatRate(value: number): string {
  return `${formatNumber(value, 4, 4)}%`;
}
