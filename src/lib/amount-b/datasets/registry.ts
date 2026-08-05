/**
 * Amount B – Dataset Registry
 *
 * Registro delle versioni dei dataset usati per Amount B (Pillar One).
 * Ogni data table del workbook OECD diventa un dataset versionato.
 */

export type DatasetVersion = '2024-03' | '2024-12' | '2026-01';

export const DATASET_VERSIONS: DatasetVersion[] = ['2024-03', '2024-12', '2026-01'];

export const DEFAULT_DATASET_VERSION: DatasetVersion = '2026-01';

/**
 * Metadata per una run di calcolo Amount B.
 */
export interface AmountBRunMetadata {
  workbookVersion: string; // es. "2026-02"
  jurisdictionDatasetVersion: DatasetVersion;
  pricingMatrixVersion: string; // es. "2026-02"
  datasetChecksums: Record<string, string>; // checksum per dataset
}

/**
 * Restituisce il metadata di default per una run.
 */
export function getDefaultRunMetadata(): AmountBRunMetadata {
  return {
    workbookVersion: '2026-02',
    jurisdictionDatasetVersion: DEFAULT_DATASET_VERSION,
    pricingMatrixVersion: '2026-02',
    datasetChecksums: {},
  };
}
