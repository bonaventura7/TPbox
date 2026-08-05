import {
  legalInterestDataset,
  LEGAL_INTEREST_COVERED_FROM,
  LEGAL_INTEREST_COVERED_THROUGH,
  LEGAL_INTEREST_DATASET_VERSION,
} from "./datasets/legal-interest-rates/manifest";
import {
  PENALTY_RULESET_VERSION,
  selectBand,
  selectRegime,
} from "./datasets/penalty-regimes/registry";
import type {
  InterestSegment,
  RavvedimentoInput,
  RavvedimentoOutcome,
} from "./types";

export const RAVVEDIMENTO_MODEL_VERSION = "ravvedimento-model.v1";

/**
 * Convenzione documentata: giorno iniziale escluso, giorno di versamento incluso.
 * Divisore: giorni effettivi dell'anno civile (365 o 366).
 */
export const DAY_COUNT_CONVENTION =
  "Giorno iniziale escluso, giorno di versamento incluso; divisore 365/366 (anno civile)";

const MS_DAY = 86_400_000;

function utc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function toISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / MS_DAY);
}

function yearDays(year: number): 365 | 366 {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 366 : 365;
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function isValidISO(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(utc(value));
}

export function computeInterestSegments(
  baseCents: number,
  dueDate: string,
  paymentDate: string,
): InterestSegment[] {
  const segments: InterestSegment[] = [];
  const startYear = Number(dueDate.slice(0, 4));
  const endYear = Number(paymentDate.slice(0, 4));

  for (let year = startYear; year <= endYear; year += 1) {
    // Estremo inferiore escluso: 31/12 dell'anno precedente oppure la scadenza.
    const lowerMs = Math.max(utc(dueDate), utc(`${year - 1}-12-31`));
    const upperMs = Math.min(utc(paymentDate), utc(`${year}-12-31`));
    const days = Math.round((upperMs - lowerMs) / MS_DAY);
    if (days <= 0) continue;

    const rateBp = legalInterestDataset.rateBpForYear(year);
    if (rateBp === null) continue;

    const divisor = yearDays(year);
    const interestCents = Math.round((baseCents * rateBp * days) / (divisor * 10_000));

    segments.push({
      year,
      from: toISO(lowerMs + MS_DAY),
      to: toISO(upperMs),
      days,
      yearDays: divisor,
      rateBp,
      interestCents,
      source: legalInterestDataset.source,
    });
  }

  return segments;
}

export function computeRavvedimento(input: RavvedimentoInput): RavvedimentoOutcome {
  const { originalDueDate, paymentDate } = input;

  if (!isValidISO(originalDueDate) || !isValidISO(paymentDate)) {
    return { status: "blocked", reason: "INVALID_INPUT", message: "Date non valide." };
  }

  const dueCents = toCents(input.amountDue);
  const paidCents = input.violationType === "INSUFFICIENT_PAYMENT" ? toCents(input.amountPaid ?? 0) : 0;
  const baseCents = dueCents - paidCents;

  if (!Number.isFinite(baseCents) || baseCents <= 0) {
    return {
      status: "blocked",
      reason: "INVALID_INPUT",
      message: "L'importo da regolarizzare deve essere maggiore di zero.",
    };
  }

  const daysLate = daysBetween(originalDueDate, paymentDate);
  if (daysLate <= 0) {
    return {
      status: "blocked",
      reason: "INVALID_INPUT",
      message: "La data di versamento deve essere successiva alla scadenza originaria.",
    };
  }

  if (input.noticeReceived || input.formalAssessmentStarted) {
    return {
      status: "blocked",
      reason: "RAVVEDIMENTO_PRECLUSO",
      message:
        "In presenza di atti di liquidazione, accertamento o attività di controllo già notificate il ravvedimento può essere precluso: il calcolo non viene eseguito.",
    };
  }

  if (originalDueDate < LEGAL_INTEREST_COVERED_FROM || paymentDate > LEGAL_INTEREST_COVERED_THROUGH) {
    return {
      status: "blocked",
      reason: "DATASET_COVERAGE",
      message: `Il dataset dei tassi legali copre dal ${LEGAL_INTEREST_COVERED_FROM} al ${LEGAL_INTEREST_COVERED_THROUGH}. Fuori da questo intervallo il calcolo è bloccato: nessun tasso viene stimato o prolungato.`,
    };
  }

  const regime = selectRegime(originalDueDate);
  const penaltyBand = regime ? selectBand(regime, daysLate) : null;
  if (!regime || !penaltyBand) {
    return {
      status: "blocked",
      reason: "NO_PENALTY_REGIME",
      message: "Nessun regime sanzionatorio configurato per la data della violazione.",
    };
  }

  const interestSegments = computeInterestSegments(baseCents, originalDueDate, paymentDate);
  const interestCents = interestSegments.reduce((sum, s) => sum + s.interestCents, 0);
  const penaltyCents = Math.round((baseCents * penaltyBand.effectiveRateBp) / 10_000);

  const warnings: string[] = [
    "Maggiorazione non calcolata: nessuna regola di maggiorazione è configurata e verificata per il caso selezionato.",
  ];
  if (regime.status !== "verified") {
    warnings.push(
      "Aliquote sanzionatorie da validare: il ruleset è in stato non verificato e va confermato da un professionista.",
    );
  }

  return {
    status: "ok",
    modelVersion: RAVVEDIMENTO_MODEL_VERSION,
    interestDatasetVersion: LEGAL_INTEREST_DATASET_VERSION,
    penaltyRulesetVersion: PENALTY_RULESET_VERSION,
    penaltyRulesetStatus: regime.status,
    baseCents,
    daysLate,
    dayCountConvention: DAY_COUNT_CONVENTION,
    interestSegments,
    interestCents,
    penaltyBand,
    penaltyCents,
    totalCents: baseCents + interestCents + penaltyCents,
    warnings,
  };
}

export function formatEuroCents(cents: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function formatRateBp(bp: number): string {
  return `${new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bp / 100)}%`;
}