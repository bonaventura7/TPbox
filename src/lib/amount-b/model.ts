/**
 * Amount B – Modello di dominio
 *
 * Contratto di input e output del calcolo dell'Approccio Semplificato e
 * Razionalizzato (Pillar One, Amount B), allineato al workbook OCSE
 * "Pricing Automation Tool for the Simplified and Streamlined Approach"
 * (February 2026 version).
 *
 * Convenzione sugli anni. Il conto economico usa gli esercizi x-3, x-2, x-1
 * per i test di scoping e di factor intensity, e l'esercizio x per il pricing.
 * Lo stato patrimoniale usa quattro esercizi, da x-4 a x-1, perché ogni voce
 * entra nel calcolo come media tra saldo di apertura e saldo di chiusura.
 */

import type {
  FactorIntensity,
  IndustryGrouping,
  JurisdictionRecord,
  SovereignCreditRating,
} from "./datasets/types";
import type { DatasetVersion } from "./datasets/registry";
import type { DatasetChecksums } from "./datasets/checksums";
import type { OeccBand } from "./datasets/reference-tables";

/** Serie di tre esercizi: x-3, x-2, x-1. */
export type ThreeYears = readonly [number, number, number];

/** Serie di quattro esercizi: x-4, x-3, x-2, x-1. */
export type FourYears = readonly [number, number, number, number];

/** Etichette degli esercizi, per la presentazione. */
export const PL_YEAR_LABELS = ["x-3", "x-2", "x-1"] as const;
export const BS_YEAR_LABELS = ["x-4", "x-3", "x-2", "x-1"] as const;

/** Distribuzione dei ricavi su un solo industry grouping. */
export interface SingleIndustryInput {
  readonly kind: "single";
  readonly industryGrouping: IndustryGrouping;
}

/** Una delle categorie di prodotto nel caso multi-industry. */
export interface IndustrySplitEntry {
  readonly industryGrouping: IndustryGrouping;
  /** Ricavi netti dell'esercizio x attribuibili alla categoria. */
  readonly netRevenues: number;
}

/**
 * Distribuzione dei ricavi su più industry grouping.
 *
 * La prima categoria è quella su cui ricade la maggioranza dei ricavi: se la
 * de minimis non è superata, il return è determinato dalla sola prima
 * categoria. Il workbook non verifica che sia effettivamente la maggiore;
 * questa implementazione lo segnala come avvertimento.
 */
export interface MultiIndustryInput {
  readonly kind: "multi";
  readonly first: IndustrySplitEntry;
  readonly second?: IndustrySplitEntry;
  readonly third?: IndustrySplitEntry;
}

export type IndustryInput = SingleIndustryInput | MultiIndustryInput;

/** Input completo del calcolo. */
export interface AmountBInput {
  /** Denominazione OCSE della giurisdizione della tested party. */
  readonly jurisdiction: string;
  /** Versione della data table da usare per i dati di giurisdizione. */
  readonly datasetVersion: DatasetVersion;
  /**
   * Limite superiore dell'OES richiesto dalla giurisdizione ai fini del
   * criterio quantitativo di scoping (par. 13.b della guidance).
   * Compreso tra 0,20 e 0,30.
   */
  readonly oesUpperBound: number;

  /** Ricavi netti, esercizi x-3, x-2, x-1. */
  readonly netRevenues: ThreeYears;
  /** Costo del venduto, esercizi x-3, x-2, x-1. */
  readonly cogs: ThreeYears;
  /** Costi operativi, esercizi x-3, x-2, x-1. */
  readonly operatingExpenses: ThreeYears;

  /** Ricavi netti dell'esercizio x. */
  readonly netRevenuesYearX: number;
  /** Costi operativi dell'esercizio x. */
  readonly operatingExpensesYearX: number;

  /** Immobilizzazioni, esercizi x-4, x-3, x-2, x-1. */
  readonly fixedAssets: FourYears;
  /** Crediti commerciali, esercizi x-4, x-3, x-2, x-1. */
  readonly debtors: FourYears;
  /** Rimanenze, esercizi x-4, x-3, x-2, x-1. */
  readonly stock: FourYears;
  /** Debiti commerciali, esercizi x-4, x-3, x-2, x-1. */
  readonly creditors: FourYears;

  readonly industry: IndustryInput;
}

/** Esito del criterio quantitativo di scoping. */
export type ScopingVerdict =
  "Quantitative scoping criteria met" | "Quantitative scoping criteria not met" | "Indeterminato";

export interface ScopingOutcome {
  /** Media ponderata dei costi operativi sui ricavi netti (OES). */
  readonly oes: number | null;
  readonly lowerBound: number;
  readonly upperBound: number;
  readonly verdict: ScopingVerdict;
}

/** Dettaglio annuale del guardrail sui debiti commerciali. */
export interface AccountsPayableYear {
  readonly yearLabel: string;
  /** Debiti commerciali medi tra apertura e chiusura. */
  readonly averageCreditors: number | null;
  readonly cogs: number;
  /** Giorni di debito commerciale. */
  readonly days: number | null;
  /** Vero se i giorni non superano la soglia di 90. */
  readonly meetsThreshold: boolean | null;
  /** Debiti rettificati, valorizzati solo quando la soglia è superata. */
  readonly adjustedCreditors: number | null;
  /** Valore effettivamente usato nel capitale circolante. */
  readonly creditorsUsed: number | null;
}

export interface CapitalYear {
  readonly yearLabel: string;
  readonly averageStock: number | null;
  readonly averageDebtors: number | null;
  readonly averageFixedAssets: number | null;
  readonly workingCapital: number | null;
  readonly netOperatingAssets: number | null;
}

export interface FactorIntensityOutcome {
  /** Media ponderata delle attività operative nette sui ricavi netti (OAS). */
  readonly oas: number | null;
  readonly oes: number | null;
  readonly classification: FactorIntensity | null;
  /**
   * Classificazione che si otterrebbe senza applicare il guardrail sui debiti
   * commerciali. Il workbook la espone per mostrare l'effetto del guardrail.
   */
  readonly classificationWithoutGuardrail: FactorIntensity | null;
}

export interface Section51Outcome {
  readonly industryGrouping: IndustryGrouping | null;
  /** Vero nel caso multi-industry quando la de minimis del 20% è superata. */
  readonly deMinimisExceeded: boolean | null;
  readonly weightedAverageRequired: boolean;
  /** Return on sales della matrice, in forma decimale. */
  readonly returnOnSales: number | null;
  /** Estremo inferiore della fascia accettabile (return meno 0,5 punti). */
  readonly rangeLower: number | null;
  /** Estremo superiore della fascia accettabile (return più 0,5 punti). */
  readonly rangeUpper: number | null;
  /** Composizione del return nel caso multi-industry. */
  readonly components: ReadonlyArray<{
    readonly industryGrouping: IndustryGrouping;
    readonly share: number;
    readonly matrixReturn: number;
  }>;
}

export interface Section52Outcome {
  readonly band: OeccBand | null;
  readonly capRatesApplicable: string;
  readonly cap: number | null;
  readonly collar: number;
  /** EBIT dell'esercizio x derivante dall'applicazione della Section 5.1. */
  readonly ebit: number | null;
  /** Rendimento equivalente sui costi operativi. */
  readonly equivalentReturnOnOpEx: number | null;
  readonly capTriggered: boolean | null;
  readonly collarTriggered: boolean | null;
  readonly adjustmentRequired: boolean;
  readonly adjustedEbit: number | null;
  readonly adjustedReturnOnSales: number | null;
}

export interface Section53Outcome {
  readonly damQualifying: boolean;
  readonly adjustmentRequired: boolean;
  /** OAS con il cap dell'85% applicato. */
  readonly oasCapped: number | null;
  readonly creditRating: SovereignCreditRating;
  readonly netRiskAdjustment: number | null;
  /** Rettifica in punti di return on sales. */
  readonly adjustment: number | null;
  readonly adjustedReturnOnSales: number | null;
}

/** Avvertimento non bloccante emerso durante il calcolo. */
export interface AmountBWarning {
  readonly code: string;
  readonly message: string;
}

/** Errore bloccante: il calcolo non può proseguire. */
export interface AmountBError {
  readonly code: string;
  readonly message: string;
}

export interface AmountBRunMetadata {
  /** Versione del workbook OCSE di riferimento. */
  readonly workbookVersion: string;
  readonly jurisdictionDatasetVersion: DatasetVersion;
  readonly pricingMatrixVersion: string;
  readonly datasetChecksums: DatasetChecksums;
}

/** Esito completo del calcolo. */
export interface AmountBResult {
  readonly ok: boolean;
  readonly errors: readonly AmountBError[];
  readonly warnings: readonly AmountBWarning[];
  readonly jurisdiction: JurisdictionRecord | null;
  readonly scoping: ScopingOutcome;
  readonly accountsPayable: readonly AccountsPayableYear[];
  readonly guardrailTriggered: boolean;
  readonly capital: readonly CapitalYear[];
  readonly factorIntensity: FactorIntensityOutcome;
  readonly section51: Section51Outcome;
  readonly section52: Section52Outcome;
  readonly section53: Section53Outcome;
  /** Return on sales finale ai sensi della Section 5. */
  readonly finalReturnOnSales: number | null;
  /** EBIT dell'esercizio x corrispondente al return finale. */
  readonly finalEbit: number | null;
  readonly metadata: AmountBRunMetadata;
}
