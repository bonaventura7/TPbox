// BEPS MLI — Tipi TypeScript di base

export type JurisdictionCode = string; // es. "ITA", "FRA"

export interface MliJurisdiction {
  code: JurisdictionCode;
  nameEn: string;
  nameIt: string;
  isSignatory: boolean;
  isParty: boolean;
  signatureDate?: string; // ISO
  entryIntoForceDate?: string; // ISO
}

export interface CoveredTaxAgreement {
  id: string; // es. "ITA-FRA"
  jurisdiction1: JurisdictionCode;
  jurisdiction2: JurisdictionCode;
  title: string; // es. "Convention between Italy and France for the avoidance of double taxation"
  statusAsOf: string; // ISO date (status as of)
}

export type ProvisionOutcome =
  | 'APPLIES'
  | 'DOES_NOT_APPLY'
  | 'PARTIAL'
  | 'PENDING';

export interface MliProvision {
  article: string; // es. "Article 7"
  provisionType: string; // es. "Prevent treaty abuse"
  minimumStandard: boolean;
  outcome: ProvisionOutcome;
  explanationIt: string; // spiegazione in italiano
}

export interface MatchingOutcome {
  agreementId: string; // link a CoveredTaxAgreement.id
  jurisdiction1: JurisdictionCode;
  jurisdiction2: JurisdictionCode;
  statusAsOf: string; // ISO
  provisions: MliProvision[];
}

export interface AggregateStats {
  statusAsOf: string;
  totalJurisdictions: number;
  totalCoveredAgreements: number;
  matchedAgreements: number;
  oneWayAgreements: number;
  waitingAgreements: number;
}
