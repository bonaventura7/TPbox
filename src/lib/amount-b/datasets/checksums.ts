/**
 * Amount B – Checksum dei dataset
 *
 * SHA-256 troncato a 16 caratteri esadecimali, calcolato sul contenuto dei
 * file di dataset generati dall'estrazione del workbook OCSE. Serve a
 * riconoscere se una run è stata prodotta con dati diversi da quelli
 * attualmente in repository.
 *
 * Rigenerare con `scripts/amount-b-checksums.mjs` dopo ogni modifica ai
 * dataset.
 */

import type { DatasetVersion } from "./registry";

export interface DatasetChecksums {
  /** Checksum del file delle giurisdizioni della versione selezionata. */
  readonly jurisdictions: string;
  /** Checksum delle tabelle condivise: scala rating-NRA, prodotti, fasce OECC. */
  readonly referenceTables: string;
  /** Checksum della matrice di pricing e delle soglie del workbook. */
  readonly pricingMatrix: string;
}

const REFERENCE_TABLES = "e069e3d2471266b1";
const PRICING_MATRIX = "ae6c2d23d5e4bfff";

const JURISDICTION_CHECKSUMS: Readonly<Record<DatasetVersion, string>> = {
  "2024-03": "ed3b8a6f5f05645a",
  "2024-12": "d59c3334342354bf",
  "2026-01": "b2b243714d6bad2f",
};

/** Checksum dei dataset effettivamente usati da una run. */
export function getDatasetChecksums(version: DatasetVersion): DatasetChecksums {
  return {
    jurisdictions: JURISDICTION_CHECKSUMS[version],
    referenceTables: REFERENCE_TABLES,
    pricingMatrix: PRICING_MATRIX,
  };
}
