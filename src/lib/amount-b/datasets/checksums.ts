/**
 * Amount B – Dataset Checksums
 *
 * Placeholder per i checksum dei dataset versionati.
 * In una implementazione reale, questi checksum saranno calcolati
 * sui file JSON/TS dei dataset e usati per audit e versioning.
 */

export interface DatasetChecksums {
  jurisdictions: string;
  creditRatings: string;
  products: string;
}

/**
 * Checksum per versione dataset.
 */
export const DATASET_CHECKSUMS: Record<'2024-03' | '2024-12' | '2026-01', DatasetChecksums> = {
  '2024-03': {
    jurisdictions: 'TODO',
    creditRatings: 'TODO',
    products: 'TODO',
  },
  '2024-12': {
    jurisdictions: 'TODO',
    creditRatings: 'TODO',
    products: 'TODO',
  },
  '2026-01': {
    jurisdictions: 'TODO',
    creditRatings: 'TODO',
    products: 'TODO',
  },
};
