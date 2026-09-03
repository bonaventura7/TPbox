/**
 * Manifest dello snapshot congelato: versione, copertura e forma canonica per
 * il controllo di integrita'. La forma canonica ordina le chiavi e non contiene
 * timestamp, quindi due dataset con gli stessi valori producono la stessa
 * stringa: il test la confronta con un hash registrato e intercetta modifiche
 * involontarie ai valori.
 */
import type { DatasetProvenance } from "../types";
import {
  SNAPSHOT_BUILT_AT,
  SNAPSHOT_COUNTRY,
  SNAPSHOT_DATE,
  SNAPSHOT_FX,
  SNAPSHOT_ORIGIN_HASH,
  SNAPSHOT_RATES,
  SNAPSHOT_VERSION,
} from "./2026-09-03";

export const DATASET: DatasetProvenance = {
  version: SNAPSHOT_VERSION,
  snapshotDate: SNAPSHOT_DATE,
  builtAt: SNAPSHOT_BUILT_AT,
  originHash: SNAPSHOT_ORIGIN_HASH,
};

/** Numero di serie coperte dallo snapshot. */
export const SNAPSHOT_COVERAGE = {
  fx: Object.keys(SNAPSHOT_FX).length,
  rates: Object.keys(SNAPSHOT_RATES).length,
  country: 1,
} as const;

export function canonicalSnapshot(): string {
  const sorted = (record: Readonly<Record<string, { value: number; asOf: string }>>) =>
    Object.keys(record)
      .sort()
      .map((key) => {
        const point = record[key];
        return `${key}|${point?.asOf ?? ""}|${point?.value ?? ""}`;
      })
      .join("\n");
  const country = SNAPSHOT_COUNTRY;
  return [
    `date|${SNAPSHOT_DATE}`,
    sorted(SNAPSHOT_FX),
    sorted(SNAPSHOT_RATES),
    [
      "country",
      country.asOf,
      country.data.ratingMoodys,
      country.data.defaultSpread,
      country.data.totalErp,
      country.data.countryRiskPremium,
      country.data.cds10y ?? "",
    ].join("|"),
  ].join("\n");
}
