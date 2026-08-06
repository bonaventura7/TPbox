/**
 * Amount B – Motore di calcolo
 *
 * Funzioni pure che riproducono la logica del workbook OCSE "Pricing
 * Automation Tool for the Simplified and Streamlined Approach"
 * (February 2026 version). Ogni blocco riporta il foglio e le celle di
 * origine, così che il risultato resti riconducibile alla fonte.
 *
 * Il motore non ha dipendenze da React, dalla rete o dal filesystem: riceve
 * un input e restituisce un esito, senza effetti collaterali.
 */

import {
  ACCOUNTS_PAYABLE_GUARDRAIL_DAYS,
  DAM_OAS_CAP,
  DAYS_IN_YEAR,
  FACTOR_INTENSITY_THRESHOLDS,
  MULTI_INDUSTRY_DE_MINIMIS,
  OECC_CAPS,
  OECC_COLLAR,
  PRICING_BAND_HALF_WIDTH,
  PRICING_MATRIX,
  PRICING_MATRIX_VERSION,
  SCOPING_OES_LOWER_BOUND,
  SCOPING_OES_UPPER_BOUND_RANGE,
} from "./datasets/pricing-matrix";
import {
  OECC_BAND_BY_FACTOR_INTENSITY,
  netRiskAdjustmentForRating,
} from "./datasets/reference-tables";
import { getDatasetChecksums } from "./datasets/checksums";
import { WORKBOOK_VERSION, getJurisdictions } from "./datasets/registry";
import type { FactorIntensity, IndustryGrouping, JurisdictionRecord } from "./datasets/types";
import type {
  AccountsPayableYear,
  AmountBError,
  AmountBInput,
  AmountBResult,
  AmountBWarning,
  CapitalYear,
  FourYears,
  IndustrySplitEntry,
  ScopingVerdict,
  Section51Outcome,
  ThreeYears,
} from "./model";
import { BS_YEAR_LABELS, PL_YEAR_LABELS } from "./model";

/* -------------------------------------------------------------------------- */
/* Utilità numeriche                                                          */
/* -------------------------------------------------------------------------- */

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/** Indici dei tre esercizi del conto economico. */
type YearIndex = 0 | 1 | 2;

/**
 * Costruisce una tripla applicando una funzione ai tre esercizi.
 *
 * Serve a non perdere i tipi: con `noUncheckedIndexedAccess` l'accesso a una
 * tupla per indice variabile produrrebbe `number | undefined`, mentre con un
 * indice di tipo `0 | 1 | 2` resta `number`.
 */
function mapYears<T>(fn: (index: YearIndex, label: string) => T): [T, T, T] {
  return [fn(0, PL_YEAR_LABELS[0]), fn(1, PL_YEAR_LABELS[1]), fn(2, PL_YEAR_LABELS[2])];
}

/** Divisione protetta: restituisce `null` invece di infinito o NaN. */
function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

/**
 * Media tra saldo di apertura e saldo di chiusura per le voci patrimoniali.
 *
 * Foglio "3 Automated Calculations", righe 21, 30, 31 e 39. La formula del
 * workbook è, per l'esercizio x-3, `IF(x-4 = 0, x-3, (x-4 + x-3) / 2)` e, per
 * gli esercizi successivi, la stessa con la condizione estesa a tutti gli
 * esercizi precedenti: il saldo puntuale sostituisce la media solo quando
 * ogni esercizio precedente è a zero. Serve alle società che non hanno
 * quattro esercizi di storico patrimoniale.
 *
 * @param raw saldi degli esercizi x-4, x-3, x-2, x-1
 * @returns valori medi per gli esercizi x-3, x-2, x-1
 */
export function averageBalances(raw: FourYears): ThreeYears {
  const [m4, m3, m2, m1] = raw;
  const avg3 = m4 === 0 ? m3 : (m4 + m3) / 2;
  const avg2 = m4 === 0 && m3 === 0 ? m2 : (m3 + m2) / 2;
  const avg1 = m4 === 0 && m3 === 0 && m2 === 0 ? m1 : (m2 + m1) / 2;
  return [avg3, avg2, avg1];
}

/* -------------------------------------------------------------------------- */
/* 1. Criterio quantitativo di scoping                                        */
/* -------------------------------------------------------------------------- */

/**
 * Operating expense intensity (OES), media ponderata sui tre esercizi.
 *
 * Foglio "3 Automated Calculations", celle G6:G8. La media è ponderata nel
 * senso che si divide la somma triennale dei costi operativi per la somma
 * triennale dei ricavi netti, non la media delle tre incidenze annuali.
 */
export function computeOes(netRevenues: ThreeYears, operatingExpenses: ThreeYears): number | null {
  return safeDivide(sum(operatingExpenses), sum(netRevenues));
}

/**
 * Esito del criterio quantitativo (par. 13.b della guidance).
 *
 * Foglio "3 Automated Calculations", cella E14. Il criterio è soddisfatto
 * quando l'OES è compreso, estremi inclusi, tra il 3% e il limite superiore
 * fissato dalla giurisdizione.
 */
export function evaluateScoping(oes: number | null, upperBound: number): ScopingVerdict {
  if (oes === null) return "Indeterminato";
  return oes >= SCOPING_OES_LOWER_BOUND && oes <= upperBound
    ? "Quantitative scoping criteria met"
    : "Quantitative scoping criteria not met";
}

/* -------------------------------------------------------------------------- */
/* 2.1 Guardrail sui debiti commerciali, capitale circolante, OAS             */
/* -------------------------------------------------------------------------- */

/**
 * Guardrail sui debiti commerciali.
 *
 * Foglio "3 Automated Calculations", righe 21-26. I giorni di debito si
 * calcolano sui debiti medi, non sul saldo puntuale. La soglia è di 90
 * giorni: esattamente 90 giorni la rispetta, oltre 90 no. Quando la soglia è
 * superata, il capitale circolante usa debiti rettificati pari a
 * `COGS / 365 * 90`.
 */
export function computeAccountsPayable(
  averageCreditors: ThreeYears,
  cogs: ThreeYears,
): AccountsPayableYear[] {
  return mapYears((i, yearLabel) => {
    const creditors = averageCreditors[i];
    const yearCogs = cogs[i];

    // Il workbook tratta la coppia (debiti, COGS) entrambi a zero come dato
    // assente e propaga un trattino, non uno zero.
    if (creditors === 0 && yearCogs === 0) {
      return {
        yearLabel,
        averageCreditors: null,
        cogs: yearCogs,
        days: null,
        meetsThreshold: null,
        adjustedCreditors: null,
        creditorsUsed: null,
      };
    }

    const ratio = safeDivide(creditors, yearCogs);
    const days = ratio === null ? null : ratio * DAYS_IN_YEAR;
    const meetsThreshold = days === null ? null : days <= ACCOUNTS_PAYABLE_GUARDRAIL_DAYS;
    const adjustedCreditors =
      meetsThreshold === false ? (yearCogs / DAYS_IN_YEAR) * ACCOUNTS_PAYABLE_GUARDRAIL_DAYS : null;

    return {
      yearLabel,
      averageCreditors: creditors,
      cogs: yearCogs,
      days,
      meetsThreshold,
      adjustedCreditors,
      creditorsUsed:
        meetsThreshold === null ? null : meetsThreshold ? creditors : adjustedCreditors,
    };
  });
}

/**
 * Classificazione di factor intensity.
 *
 * Foglio "3 Automated Calculations", cella E55.
 * A: OAS >= 45%. B: 30% <= OAS < 45%. C: 15% <= OAS < 30%.
 * D: OAS < 15% e OES >= 10%. E: OAS < 15% e OES < 10%.
 */
export function classifyFactorIntensity(
  oas: number | null,
  oes: number | null,
): FactorIntensity | null {
  if (oas === null || oes === null) return null;
  const t = FACTOR_INTENSITY_THRESHOLDS;
  if (oas >= t.oasA) return "A";
  if (oas >= t.oasB) return "B";
  if (oas >= t.oasC) return "C";
  return oes >= t.oesD ? "D" : "E";
}

/* -------------------------------------------------------------------------- */
/* Motore                                                                     */
/* -------------------------------------------------------------------------- */

function buildSection51(
  input: AmountBInput,
  classification: FactorIntensity | null,
  warnings: AmountBWarning[],
): Section51Outcome {
  const empty: Section51Outcome = {
    industryGrouping: null,
    deMinimisExceeded: null,
    weightedAverageRequired: false,
    returnOnSales: null,
    rangeLower: null,
    rangeUpper: null,
    components: [],
  };

  if (classification === null) return empty;
  const row = PRICING_MATRIX[classification];

  const withBand = (returnOnSales: number, rest: Partial<Section51Outcome>): Section51Outcome => ({
    ...empty,
    ...rest,
    returnOnSales,
    rangeLower: returnOnSales - PRICING_BAND_HALF_WIDTH,
    rangeUpper: returnOnSales + PRICING_BAND_HALF_WIDTH,
  });

  if (input.industry.kind === "single") {
    const ig = input.industry.industryGrouping;
    return withBand(row[ig], {
      industryGrouping: ig,
      deMinimisExceeded: null,
      components: [{ industryGrouping: ig, share: 1, matrixReturn: row[ig] }],
    });
  }

  const first = input.industry.first;
  const entries: IndustrySplitEntry[] = [first, input.industry.second, input.industry.third].filter(
    (e): e is IndustrySplitEntry => e !== undefined,
  );

  const totalYearX = input.netRevenuesYearX;
  const splitTotal = sum(entries.map((e) => e.netRevenues));

  // Foglio "2 Inputs for pricing", cella D32: la somma dei ricavi per
  // categoria deve coincidere con i ricavi netti dell'esercizio x.
  if (totalYearX > 0 && Math.abs(splitTotal - totalYearX) > 1e-9) {
    warnings.push({
      code: "INDUSTRY_SPLIT_MISMATCH",
      message:
        `La somma dei ricavi per categoria (${splitTotal}) non coincide con i ricavi netti ` +
        `dell'esercizio x (${totalYearX}). Il workbook OCSE in questo caso restituisce ERRORE.`,
    });
  }

  const components = entries.map((e) => ({
    industryGrouping: e.industryGrouping,
    share: safeDivide(e.netRevenues, totalYearX) ?? 0,
    matrixReturn: row[e.industryGrouping],
  }));

  const firstShare = components[0]?.share ?? 0;
  const otherShares = components.slice(1).map((c) => c.share);

  // Foglio "3 Automated Calculations", cella D63: la de minimis si valuta
  // sulla somma delle quote della seconda e della terza categoria, non su
  // ciascuna separatamente.
  const deMinimisExceeded = sum(otherShares) > MULTI_INDUSTRY_DE_MINIMIS;

  if (otherShares.length > 0 && firstShare < Math.max(...otherShares)) {
    warnings.push({
      code: "FIRST_CATEGORY_NOT_MAJORITY",
      message:
        "La prima categoria non è quella con la quota maggiore di ricavi. Se la de minimis " +
        "non è superata il return viene determinato dalla prima categoria, come nel workbook: " +
        "verificare che l'ordine delle categorie sia corretto.",
    });
  }

  if (!deMinimisExceeded) {
    const ig = first.industryGrouping;
    return withBand(row[ig], {
      industryGrouping: ig,
      deMinimisExceeded: false,
      weightedAverageRequired: false,
      components,
    });
  }

  const weighted = sum(components.map((c) => c.share * c.matrixReturn));
  return withBand(weighted, {
    industryGrouping: null,
    deMinimisExceeded: true,
    weightedAverageRequired: true,
    components,
  });
}

/**
 * Esegue il calcolo completo dell'Amount B.
 *
 * L'esito è sempre restituito, anche quando il criterio di scoping non è
 * soddisfatto: in quel caso l'approccio semplificato non è utilizzabile e la
 * presentazione deve dirlo, ma i valori intermedi restano visibili perché
 * servono a capire perché il test non è passato.
 */
export function computeAmountB(input: AmountBInput): AmountBResult {
  const errors: AmountBError[] = [];
  const warnings: AmountBWarning[] = [];

  const jurisdictions = getJurisdictions(input.datasetVersion);
  const jurisdiction: JurisdictionRecord | null =
    jurisdictions.find((j) => j.jurisdiction === input.jurisdiction) ?? null;

  if (jurisdiction === null) {
    errors.push({
      code: "JURISDICTION_NOT_FOUND",
      message:
        `La giurisdizione "${input.jurisdiction}" non è presente nella data table ` +
        `${input.datasetVersion}. L'inclusione di una giurisdizione nella tabella non implica ` +
        "che essa abbia adottato o adotterà l'approccio semplificato.",
    });
  }

  const { min, max } = SCOPING_OES_UPPER_BOUND_RANGE;
  if (input.oesUpperBound < min || input.oesUpperBound > max) {
    warnings.push({
      code: "OES_UPPER_BOUND_OUT_OF_RANGE",
      message:
        `Il limite superiore dell'OES indicato (${(input.oesUpperBound * 100).toFixed(2)}%) è ` +
        `fuori dall'intervallo previsto dalla guidance, tra il ${min * 100}% e il ${max * 100}%.`,
    });
  }

  /* --- 1. Scoping quantitativo --- */
  const oes = computeOes(input.netRevenues, input.operatingExpenses);
  const scoping = {
    oes,
    lowerBound: SCOPING_OES_LOWER_BOUND,
    upperBound: input.oesUpperBound,
    verdict: evaluateScoping(oes, input.oesUpperBound),
  };

  /* --- 2.1 Guardrail, capitale circolante, attività operative nette --- */
  const avgCreditors = averageBalances(input.creditors);
  const avgStock = averageBalances(input.stock);
  const avgDebtors = averageBalances(input.debtors);
  const avgFixedAssets = averageBalances(input.fixedAssets);

  const accountsPayable = computeAccountsPayable(avgCreditors, input.cogs);
  const guardrailTriggered = accountsPayable.some((y) => y.meetsThreshold === false);

  const capital: CapitalYear[] = mapYears((i, yearLabel) => {
    const creditorsUsed = accountsPayable[i]?.creditorsUsed ?? null;
    const workingCapital =
      creditorsUsed === null ? null : avgStock[i] + avgDebtors[i] - creditorsUsed;
    return {
      yearLabel,
      averageStock: avgStock[i],
      averageDebtors: avgDebtors[i],
      averageFixedAssets: avgFixedAssets[i],
      workingCapital,
      netOperatingAssets: workingCapital === null ? null : avgFixedAssets[i] + workingCapital,
    };
  });

  const totalNetRevenues = sum(input.netRevenues);
  const noaValues = capital.map((c) => c.netOperatingAssets);
  const oas = noaValues.some((v) => v === null)
    ? null
    : safeDivide(sum(noaValues as number[]), totalNetRevenues);

  // Foglio "3 Automated Calculations", riga 49: OAS che si otterrebbe senza
  // applicare il guardrail, esposto per mostrarne l'effetto.
  const noaUnadjusted = mapYears(
    (i) => avgStock[i] + avgDebtors[i] - avgCreditors[i] + avgFixedAssets[i],
  );
  const oasUnadjusted = guardrailTriggered
    ? safeDivide(sum(noaUnadjusted), totalNetRevenues)
    : null;

  const classification = classifyFactorIntensity(oas, oes);
  const factorIntensity = {
    oas,
    oes,
    classification,
    classificationWithoutGuardrail: guardrailTriggered
      ? classifyFactorIntensity(oasUnadjusted, oes)
      : null,
  };

  /* --- 2.1 Pricing matrix --- */
  const section51 = buildSection51(input, classification, warnings);

  /* --- 2.2 Operating expense cross-check --- */
  const band = classification === null ? null : OECC_BAND_BY_FACTOR_INTENSITY[classification];
  const useAlternativeCaps = jurisdiction?.category === 2;
  const cap =
    band === null ? null : OECC_CAPS[band][useAlternativeCaps ? "alternative" : "default"];

  const ebit =
    section51.returnOnSales === null ? null : input.netRevenuesYearX * section51.returnOnSales;
  const equivalentReturnOnOpEx =
    ebit === null ? null : safeDivide(ebit, input.operatingExpensesYearX);

  const capTriggered =
    equivalentReturnOnOpEx === null || cap === null ? null : equivalentReturnOnOpEx > cap;
  const collarTriggered =
    equivalentReturnOnOpEx === null ? null : equivalentReturnOnOpEx < OECC_COLLAR;
  const adjustment52Required = capTriggered === true || collarTriggered === true;

  const appliedRate = capTriggered === true ? cap : collarTriggered === true ? OECC_COLLAR : null;
  const adjustedEbit =
    adjustment52Required && appliedRate !== null
      ? input.operatingExpensesYearX * appliedRate
      : null;
  const adjustedReturnOnSales52 =
    adjustedEbit === null ? null : safeDivide(adjustedEbit, input.netRevenuesYearX);

  const section52 = {
    band,
    capRatesApplicable: jurisdiction?.capRatesApplicable ?? "-",
    cap,
    collar: OECC_COLLAR,
    ebit,
    equivalentReturnOnOpEx,
    capTriggered,
    collarTriggered,
    adjustmentRequired: adjustment52Required,
    adjustedEbit,
    adjustedReturnOnSales: adjustedReturnOnSales52,
  };

  /* --- 2.3 Data availability mechanism --- */
  // Foglio "3 Automated Calculations", cella E111: la base della Section 5.3 è
  // il return della 5.2 se questa ha prodotto una rettifica, altrimenti quello
  // della 5.1.
  const returnBefore53 = adjustment52Required ? adjustedReturnOnSales52 : section51.returnOnSales;

  const damQualifying = jurisdiction?.damQualifying ?? false;
  const oasCapped = oas === null ? null : Math.min(oas, DAM_OAS_CAP);
  const creditRating = jurisdiction?.creditRatingUsed ?? "-";
  const netRiskAdjustment = netRiskAdjustmentForRating(creditRating) ?? null;

  if (jurisdiction !== null && damQualifying && netRiskAdjustment === null) {
    errors.push({
      code: "CREDIT_RATING_NOT_IN_SCALE",
      message:
        `Il rating "${creditRating}" non è presente nella scala rating-NRA della data table. ` +
        "La rettifica della Section 5.3 non può essere calcolata.",
    });
  }

  const adjustment53 =
    damQualifying && oasCapped !== null && netRiskAdjustment !== null
      ? netRiskAdjustment * oasCapped
      : null;
  const adjustedReturnOnSales53 =
    adjustment53 === null || returnBefore53 === null ? null : returnBefore53 + adjustment53;

  const section53 = {
    damQualifying,
    adjustmentRequired: damQualifying,
    oasCapped,
    creditRating,
    netRiskAdjustment,
    adjustment: adjustment53,
    adjustedReturnOnSales: adjustedReturnOnSales53,
  };

  /* --- 3. Return on sales finale --- */
  const finalReturnOnSales = damQualifying ? adjustedReturnOnSales53 : returnBefore53;
  const finalEbit =
    finalReturnOnSales === null ? null : input.netRevenuesYearX * finalReturnOnSales;

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    jurisdiction,
    scoping,
    accountsPayable,
    guardrailTriggered,
    capital,
    factorIntensity,
    section51,
    section52,
    section53,
    finalReturnOnSales,
    finalEbit,
    metadata: {
      workbookVersion: WORKBOOK_VERSION,
      jurisdictionDatasetVersion: input.datasetVersion,
      pricingMatrixVersion: PRICING_MATRIX_VERSION,
      datasetChecksums: getDatasetChecksums(input.datasetVersion),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Formattazione                                                              */
/* -------------------------------------------------------------------------- */

/** Percentuale in formato italiano, con due decimali. */
export function formatPercent(value: number | null, decimals = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(decimals).replace(".", ",")}%`;
}

/** Numero in formato italiano. */
export function formatNumber(value: number | null, decimals = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Giorni, con due decimali. */
export function formatDays(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${formatNumber(value, 2)} giorni`;
}

/** Etichette degli esercizi patrimoniali, riesportate per la UI. */
export { BS_YEAR_LABELS, PL_YEAR_LABELS };
