/**
 * Amount B – Registro dei dataset
 *
 * Ogni data table del workbook OCSE è un dataset versionato. Una run registra
 * la versione usata, così un ricalcolo a distanza di mesi resta confrontabile
 * con l'originale anche dopo che l'OCSE ha pubblicato una nuova data table.
 *
 * Tra dicembre 2024 e gennaio 2026 sono cambiati i rating sovrani di 30
 * giurisdizioni: la scelta della versione incide sul risultato della
 * Section 5.3, non è una formalità.
 */

import { JURISDICTIONS_2024_03 } from "./2024-03/jurisdictions";
import { JURISDICTIONS_2024_12 } from "./2024-12/jurisdictions";
import { JURISDICTIONS_2026_01 } from "./2026-01/jurisdictions";
import type { JurisdictionRecord } from "./types";

export type DatasetVersion = "2024-03" | "2024-12" | "2026-01";

export const DATASET_VERSIONS: readonly DatasetVersion[] = ["2026-01", "2024-12", "2024-03"];

export const DEFAULT_DATASET_VERSION: DatasetVersion = "2026-01";

/** Versione del workbook OCSE da cui deriva l'intera implementazione. */
export const WORKBOOK_VERSION = "2026-02";

/** Etichette leggibili delle data table. */
export const DATASET_LABELS: Readonly<Record<DatasetVersion, string>> = {
  "2026-01": "Data table gennaio 2026",
  "2024-12": "Data table dicembre 2024",
  "2024-03": "Data table marzo 2024",
};

const REGISTRY: Readonly<Record<DatasetVersion, readonly JurisdictionRecord[]>> = {
  "2024-03": JURISDICTIONS_2024_03,
  "2024-12": JURISDICTIONS_2024_12,
  "2026-01": JURISDICTIONS_2026_01,
};

/** Giurisdizioni di una versione, in ordine alfabetico come nel workbook. */
export function getJurisdictions(version: DatasetVersion): readonly JurisdictionRecord[] {
  return REGISTRY[version];
}

/** Record di una giurisdizione, `undefined` se assente dalla data table. */
export function findJurisdiction(
  version: DatasetVersion,
  name: string,
): JurisdictionRecord | undefined {
  return REGISTRY[version].find((j) => j.jurisdiction === name);
}
