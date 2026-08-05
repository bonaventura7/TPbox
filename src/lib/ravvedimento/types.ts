export type ISODate = string; // YYYY-MM-DD

export type ViolationType = "OMITTED_PAYMENT" | "INSUFFICIENT_PAYMENT" | "LATE_PAYMENT";

export type RavvedimentoInput = {
  violationType: ViolationType;
  /** Importo dovuto in euro (stringa o numero: convertito in centesimi). */
  amountDue: number;
  /** Importo eventualmente già versato (per versamento insufficiente). */
  amountPaid?: number;
  originalDueDate: ISODate;
  paymentDate: ISODate;
  noticeReceived: boolean;
  formalAssessmentStarted: boolean;
};

export type InterestSegment = {
  year: number;
  from: ISODate;
  to: ISODate;
  days: number;
  yearDays: 365 | 366;
  rateBp: number;
  interestCents: number;
  source: string;
};

export type PenaltyBand = {
  id: string;
  description: string;
  /** Aliquota effettiva applicata, in basis point. */
  effectiveRateBp: number;
  legalReference: string;
};

export type BlockedReason =
  | "DATASET_COVERAGE"
  | "NO_PENALTY_REGIME"
  | "RAVVEDIMENTO_PRECLUSO"
  | "INVALID_INPUT";

export type RavvedimentoBlocked = {
  status: "blocked";
  reason: BlockedReason;
  message: string;
};

export type RavvedimentoResult = {
  status: "ok";
  modelVersion: string;
  interestDatasetVersion: string;
  penaltyRulesetVersion: string;
  penaltyRulesetStatus: "verified" | "unverified";
  baseCents: number;
  daysLate: number;
  dayCountConvention: string;
  interestSegments: InterestSegment[];
  interestCents: number;
  penaltyBand: PenaltyBand;
  penaltyCents: number;
  totalCents: number;
  warnings: string[];
};

export type RavvedimentoOutcome = RavvedimentoResult | RavvedimentoBlocked;