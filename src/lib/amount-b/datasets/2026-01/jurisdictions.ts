/**
 * Amount B – Jurisdictions Dataset (2026-01)
 *
 * Estratto dalla "Data Table as of January 2026" del workbook OECD.
 * Per ora contiene solo uno stub; i dati completi saranno inseriti
 * in una fase successiva (Phase 2).
 */

export interface JurisdictionRecord {
  jurisdiction: string;
  incomeGroup: string;
  category: string;
  capRatesApplicable: string;
  damQualifying: boolean;
  creditRatingUsed: string;
  nra: number;
  oasClassification: 'A' | 'B' | 'C' | 'D' | 'E';
}

/**
 * Stub del dataset jurisdictions per 2026-01.
 */
export const JURISDICTIONS_2026_01: JurisdictionRecord[] = [
  // Japan (esempio)
  {
    jurisdiction: 'Japan',
    incomeGroup: 'High income',
    category: 'Category 1',
    capRatesApplicable: 'Default cap rates',
    damQualifying: false,
    creditRatingUsed: 'A',
    nra: 0,
    oasClassification: 'C',
  },
  // Altri record da aggiungere
];
