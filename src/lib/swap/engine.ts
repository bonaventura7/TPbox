/**
 * Motore del calcolatore Interest Rate Swap.
 *
 * Cosa fa: dallo scadenzario e dalle convenzioni ricava la frazione d'anno di
 * ogni periodo e gli interessi maturati sulle due gambe.
 *
 * Cosa non fa, ed e' dichiarato negli avvisi: non costruisce una curva, non
 * sconta i flussi, non calcola un par swap rate ne' un NPV. Servirebbe una
 * curva swap che il portale oggi non ha da fonte primaria: la curva
 * governativa area euro AAA e i Treasury CMT sono rendimenti governativi, e un
 * par yield governativo non e' un tasso swap. Il tasso variabile inserito e'
 * un'ipotesi piatta dell'analista, non un fixing forward.
 */

import { toIso, yearFraction, dayCount, parseIsoDate, DAY_COUNT_LABELS } from "./daycount";
import { buildSchedule, FREQUENCY_LABELS } from "./schedule";
import type { LegPeriod, LegResult, SwapInput, SwapOutcome } from "./types";

export const ENGINE_VERSION = "1.0.0";

/** Arrotondamento monetario a due decimali, stabile sui mezzi centesimi. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildLeg(
  label: string,
  input: SwapInput,
  ratePercent: number,
  which: "fixed" | "floating",
): LegResult {
  const convention = which === "fixed" ? input.fixedDayCount : input.floatingDayCount;
  const frequency = which === "fixed" ? input.fixedFrequency : input.floatingFrequency;
  const rate = ratePercent / 100;

  const periods: LegPeriod[] = buildSchedule(
    input.effectiveDate,
    input.maturityDate,
    frequency,
  ).map((period) => {
    const fraction = yearFraction(convention, period.startDate, period.endDate);
    return {
      ...period,
      days: dayCount(period.startDate, period.endDate),
      yearFraction: fraction,
      ratePercent,
      interest: round2(input.notional * rate * fraction),
    };
  });

  return {
    label,
    dayCount: convention,
    frequency,
    ratePercent,
    periods,
    total: round2(periods.reduce((sum, period) => sum + period.interest, 0)),
  };
}

function validate(input: SwapInput): string | null {
  if (input.effectiveDate.trim() === "") {
    return "la data dello swap e' obbligatoria";
  }
  const effective = parseIsoDate(input.effectiveDate);
  if (effective === null) {
    return "la data dello swap non e' una data valida in formato AAAA-MM-GG";
  }
  if (input.maturityDate.trim() === "") {
    return "la scadenza e' obbligatoria";
  }
  const maturity = parseIsoDate(input.maturityDate);
  if (maturity === null) {
    return "la scadenza non e' una data valida in formato AAAA-MM-GG";
  }
  if (maturity <= effective) {
    return "la scadenza deve essere successiva alla data dello swap";
  }
  if (!Number.isFinite(input.notional) || input.notional <= 0) {
    return "il nozionale deve essere un numero positivo";
  }
  if (!Number.isFinite(input.fixedRatePercent)) {
    return "il tasso fisso deve essere un numero";
  }
  if (input.floatingRatePercent !== null && !Number.isFinite(input.floatingRatePercent)) {
    return "il tasso variabile deve essere un numero";
  }
  return null;
}

export function computeSwap(input: SwapInput): SwapOutcome {
  const invalid = validate(input);
  if (invalid !== null) return { ok: false, reason: invalid };

  const fixedLeg = buildLeg("Gamba fissa", input, input.fixedRatePercent, "fixed");
  const floatingLeg =
    input.floatingRatePercent === null
      ? null
      : buildLeg("Gamba variabile", input, input.floatingRatePercent, "floating");

  const warnings: string[] = [
    "Le date di pagamento non sono aggiustate per i giorni lavorativi: manca un calendario TARGET o locale, e un aggiustamento senza calendario sarebbe una convenzione arbitraria.",
  ];
  if (fixedLeg.periods.some((period) => period.stub)) {
    warnings.push(
      "Lo scadenzario e' generato all'indietro dalla scadenza: il primo periodo e' irregolare (front stub).",
    );
  }
  if (floatingLeg !== null) {
    warnings.push(
      "Il tasso variabile e' applicato piatto su tutti i periodi: e' un'ipotesi dell'analista, non una curva forward.",
    );
  }

  const basis =
    `Gamba fissa ${DAY_COUNT_LABELS[fixedLeg.dayCount]} ${FREQUENCY_LABELS[fixedLeg.frequency]}` +
    (floatingLeg === null
      ? ""
      : ` · gamba variabile ${DAY_COUNT_LABELS[floatingLeg.dayCount]} ${FREQUENCY_LABELS[floatingLeg.frequency]}`);

  return {
    ok: true,
    result: {
      input,
      fixedLeg,
      floatingLeg,
      netTotal: floatingLeg === null ? null : round2(fixedLeg.total - floatingLeg.total),
      warnings,
      audit: {
        engineVersion: ENGINE_VERSION,
        basis,
        computedAt: toIso(new Date()),
      },
    },
  };
}

/** Esportazione dei flussi in CSV, separatore punto e virgola per Excel italiano. */
export function toCsv(input: SwapInput, legs: readonly LegResult[]): string {
  const header = [
    "gamba",
    "periodo",
    "inizio",
    "fine",
    "giorni",
    "frazione_anno",
    "tasso_pct",
    "interessi",
    "stub",
  ].join(";");
  const rows = legs.flatMap((leg) =>
    leg.periods.map((period) =>
      [
        leg.label,
        period.index,
        period.startDate,
        period.endDate,
        period.days,
        period.yearFraction.toFixed(9).replace(".", ","),
        period.ratePercent.toFixed(6).replace(".", ","),
        period.interest.toFixed(2).replace(".", ","),
        period.stub ? "si" : "no",
      ].join(";"),
    ),
  );
  const totals = legs.map((leg) =>
    ["TOTALE", leg.label, "", "", "", "", "", leg.total.toFixed(2).replace(".", ","), ""].join(";"),
  );
  return [`# nozionale;${input.notional};${input.currency}`, header, ...rows, ...totals].join("\n");
}
