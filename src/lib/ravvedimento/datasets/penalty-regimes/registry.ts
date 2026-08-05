import type { PenaltyBand } from "../../types";

export const PENALTY_RULESET_VERSION = "penalty-regimes.v1-draft";

type Regime = {
  id: string;
  /** Si applica alle violazioni commesse a partire da questa data (inclusa). */
  effectiveFrom: string;
  /** Aliquota base della sanzione per omesso versamento, in bp. */
  baseRateBp: number;
  status: "verified" | "unverified";
  legalReference: string;
  bands: Array<{
    id: string;
    maxDaysLate: number | null;
    description: string;
    /** Aliquota effettiva in bp; se null si usa perDayBp * giorni. */
    effectiveRateBp: number | null;
    perDayBp?: number;
  }>;
};

/**
 * Regimi sanzionatori del ravvedimento (art. 13 D.Lgs. 472/1997 e art. 13 D.Lgs. 471/1997).
 * Selezionati in base alla data della violazione. Stato "unverified": le aliquote
 * devono essere validate da un professionista prima di essere usate operativamente.
 */
export const PENALTY_REGIMES: Regime[] = [
  {
    id: "regime-pre-2024-09-01",
    effectiveFrom: "1997-01-01",
    baseRateBp: 3000,
    status: "unverified",
    legalReference: "Art. 13 D.Lgs. 471/1997 (testo ante D.Lgs. 87/2024)",
    bands: [
      {
        id: "sprint",
        maxDaysLate: 14,
        description: "Ravvedimento sprint: entro 14 giorni",
        effectiveRateBp: null,
        perDayBp: 10,
      },
      { id: "breve", maxDaysLate: 30, description: "Entro 30 giorni: 1/10 del 15%", effectiveRateBp: 150 },
      { id: "trimestrale", maxDaysLate: 90, description: "Entro 90 giorni: 1/9 del 15%", effectiveRateBp: 167 },
      { id: "annuale", maxDaysLate: 365, description: "Entro un anno: 1/8 del 30%", effectiveRateBp: 375 },
      { id: "biennale", maxDaysLate: 730, description: "Entro due anni: 1/7 del 30%", effectiveRateBp: 429 },
      { id: "ultrabiennale", maxDaysLate: null, description: "Oltre due anni: 1/6 del 30%", effectiveRateBp: 500 },
    ],
  },
  {
    id: "regime-dal-2024-09-01",
    effectiveFrom: "2024-09-01",
    baseRateBp: 2500,
    status: "unverified",
    legalReference: "Art. 13 D.Lgs. 471/1997 come modificato dal D.Lgs. 87/2024",
    bands: [
      {
        id: "sprint",
        maxDaysLate: 14,
        description: "Ravvedimento sprint: entro 14 giorni",
        effectiveRateBp: null,
        perDayBp: 8,
      },
      { id: "breve", maxDaysLate: 30, description: "Entro 30 giorni: 1/10 del 12,5%", effectiveRateBp: 125 },
      { id: "trimestrale", maxDaysLate: 90, description: "Entro 90 giorni: 1/9 del 12,5%", effectiveRateBp: 139 },
      { id: "annuale", maxDaysLate: 365, description: "Entro un anno: 1/8 del 25%", effectiveRateBp: 313 },
      { id: "biennale", maxDaysLate: 730, description: "Entro due anni: 1/7 del 25%", effectiveRateBp: 357 },
      { id: "ultrabiennale", maxDaysLate: null, description: "Oltre due anni: 1/6 del 25%", effectiveRateBp: 417 },
    ],
  },
];

export function selectRegime(violationDate: string): Regime | null {
  const applicable = PENALTY_REGIMES.filter((r) => r.effectiveFrom <= violationDate).sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? 1 : -1,
  );
  return applicable[0] ?? null;
}

export function selectBand(regime: Regime, daysLate: number): PenaltyBand | null {
  const band = regime.bands.find((b) => b.maxDaysLate === null || daysLate <= b.maxDaysLate);
  if (!band) return null;
  const effectiveRateBp =
    band.effectiveRateBp ?? (band.perDayBp ? band.perDayBp * Math.max(daysLate, 1) : null);
  if (effectiveRateBp === null) return null;
  return {
    id: `${regime.id}:${band.id}`,
    description: band.description,
    effectiveRateBp,
    legalReference: regime.legalReference,
  };
}