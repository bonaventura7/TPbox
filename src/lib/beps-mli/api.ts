// BEPS MLI — API layer per dataset statici (demo)

import type {
  MliJurisdiction,
  CoveredTaxAgreement,
  MatchingOutcome,
  AggregateStats,
  JurisdictionCode,
} from './types'

// Nota: in una implementazione reale questi dati saranno caricati da
// file JSON in public/data/beps-mli/*.json o da un backend.
// Per ora usiamo un dataset demo inline.

const JURISDICTIONS_DEMO: MliJurisdiction[] = [
  {
    code: 'ITA',
    nameEn: 'Italy',
    nameIt: 'Italia',
    isSignatory: true,
    isParty: true,
    signatureDate: '2017-06-07',
    entryIntoForceDate: '2018-09-01',
  },
  {
    code: 'FRA',
    nameEn: 'France',
    nameIt: 'Francia',
    isSignatory: true,
    isParty: true,
    signatureDate: '2017-06-07',
    entryIntoForceDate: '2019-01-01',
  },
  {
    code: 'DEU',
    nameEn: 'Germany',
    nameIt: 'Germania',
    isSignatory: true,
    isParty: true,
    signatureDate: '2017-06-07',
    entryIntoForceDate: '2021-01-01', // demo
  },
  {
    code: 'ESP',
    nameEn: 'Spain',
    nameIt: 'Spagna',
    isSignatory: true,
    isParty: true,
    signatureDate: '2017-06-07',
    entryIntoForceDate: '2021-01-01', // demo
  },
]

const AGREEMENTS_DEMO: CoveredTaxAgreement[] = [
  {
    id: 'ITA-FRA',
    jurisdiction1: 'ITA',
    jurisdiction2: 'FRA',
    title: 'Convention between Italy and France for the avoidance of double taxation',
    statusAsOf: '2023-06-30',
  },
  {
    id: 'ITA-ESP',
    jurisdiction1: 'ITA',
    jurisdiction2: 'ESP',
    title: 'Convention between Italy and Spain for the Avoidance of Double Taxation with respect to Taxes on Income and for the Prevention of Fiscal Evasion', // vedi posizione Italia
    statusAsOf: '2023-06-30',
  },
]

const MATCHING_OUTCOMES_DEMO: MatchingOutcome[] = [
  {
    agreementId: 'ITA-FRA',
    jurisdiction1: 'ITA',
    jurisdiction2: 'FRA',
    statusAsOf: '2023-06-30',
    provisions: [
      {
        article: 'Article 6',
        provisionType: 'Purpose of a Covered Tax Agreement',
        minimumStandard: true,
        outcome: 'APPLIES',
        explanationIt:
          "L'articolo 6 chiarisce che la convenzione mira a eliminare la doppia imposizione senza creare opportunità di non imposizione o imposizione ridotta tramite evasione o elusione fiscale.",
      },
      {
        article: 'Article 7',
        provisionType: 'Prevent treaty abuse (Principal Purpose Test)',
        minimumStandard: true,
        outcome: 'APPLIES',
        explanationIt:
          "L'articolo 7 introduce un test di scopo principale (Principal Purpose Test) per evitare che vantaggi convenzionali siano concessi in presenza di schemi abusivi.",
      },
    ],
  },
  {
    agreementId: 'ITA-ESP',
    jurisdiction1: 'ITA',
    jurisdiction2: 'ESP',
    statusAsOf: '2023-06-30',
    provisions: [
      {
        article: 'Article 6',
        provisionType: 'Purpose of a Covered Tax Agreement',
        minimumStandard: true,
        outcome: 'APPLIES',
        explanationIt:
          "Per la convenzione Italia–Spagna, l'articolo 6 conferma che l'obiettivo è evitare la doppia imposizione senza creare schemi di pianificazione aggressiva.",
      },
      {
        article: 'Article 7',
        provisionType: 'Prevent treaty abuse (Principal Purpose Test)',
        minimumStandard: true,
        outcome: 'APPLIES',
        explanationIt:
          "Italia e Spagna hanno adottato il Principal Purpose Test per contrastare l'abuso delle convenzioni attraverso strutture prive di sostanza economica.",
      },
    ],
  },
]

const STATS_DEMO: AggregateStats = {
  statusAsOf: '2023-06-30',
  totalJurisdictions: JURISDICTIONS_DEMO.length,
  totalCoveredAgreements: AGREEMENTS_DEMO.length,
  matchedAgreements: MATCHING_OUTCOMES_DEMO.length,
  oneWayAgreements: 0,
  waitingAgreements: 0,
}

export function loadJurisdictions(): MliJurisdiction[] {
  return JURISDICTIONS_DEMO
}

export function loadCoveredAgreements(): CoveredTaxAgreement[] {
  return AGREEMENTS_DEMO
}

export function loadMatchingOutcomes(): MatchingOutcome[] {
  return MATCHING_OUTCOMES_DEMO
}

export function loadAggregateStats(): AggregateStats {
  return STATS_DEMO
}

export function getJurisdiction(code: JurisdictionCode): MliJurisdiction | undefined {
  return JURISDICTIONS_DEMO.find((j) => j.code === code)
}

export function getMatchingOutcome(
  j1: JurisdictionCode,
  j2: JurisdictionCode,
): MatchingOutcome | undefined {
  // Normalizziamo l'ordine dei codici per l'id
  const id = [j1, j2].sort().join('-')
  return MATCHING_OUTCOMES_DEMO.find((m) => m.agreementId === id)
}
