/**
 * Calcolatore Interest Rate Swap — modello dei dati.
 *
 * Il motore e' deterministico e senza rete: dalle convenzioni e dai tassi
 * inseriti dall'analista costruisce lo scadenzario e gli interessi di periodo.
 * Non costruisce ne' sconta una curva: dove servirebbe una curva di mercato il
 * dato resta un input dichiarato, non un valore stimato dal tool.
 */

/**
 * 30/360   bond basis, ISDA 2006 Section 4.16(f) — convenzione della gamba
 *          fissa dell'IRS EUR vanilla insieme alla frequenza annuale.
 * 30E/360  Eurobond basis, Section 4.16(g).
 * ACT/360  base monetaria: gamba variabile Euribor e SOFR.
 * ACT/365  base fixed, usata sulle valute del Commonwealth.
 * ACT/ACT  variante ISDA, Section 4.16(b).
 */
export type DayCountId = "30/360" | "30E/360" | "ACT/360" | "ACT/365" | "ACT/ACT";

export type PayFrequencyId = "ANNUAL" | "SEMI_ANNUAL" | "QUARTERLY" | "MONTHLY";

export interface SwapInput {
  /** Data di decorrenza dello swap, ISO YYYY-MM-DD. */
  readonly effectiveDate: string;
  /** Scadenza finale, ISO YYYY-MM-DD. */
  readonly maturityDate: string;
  readonly notional: number;
  readonly currency: string;
  readonly fixedRatePercent: number;
  /** Assente quando si calcola la sola gamba fissa. */
  readonly floatingRatePercent: number | null;
  readonly fixedDayCount: DayCountId;
  readonly fixedFrequency: PayFrequencyId;
  readonly floatingDayCount: DayCountId;
  readonly floatingFrequency: PayFrequencyId;
}

export interface SchedulePeriod {
  readonly index: number;
  readonly startDate: string;
  readonly endDate: string;
  /** Vero sul periodo irregolare in testa, generato all'indietro dalla scadenza. */
  readonly stub: boolean;
}

export interface LegPeriod extends SchedulePeriod {
  /** Giorni di calendario effettivi fra inizio e fine. */
  readonly days: number;
  readonly yearFraction: number;
  readonly ratePercent: number;
  readonly interest: number;
}

export interface LegResult {
  readonly label: string;
  readonly dayCount: DayCountId;
  readonly frequency: PayFrequencyId;
  readonly ratePercent: number;
  readonly periods: readonly LegPeriod[];
  readonly total: number;
}

export interface SwapAudit {
  readonly engineVersion: string;
  /** Riga sintetica delle convenzioni applicate, per la documentazione. */
  readonly basis: string;
  readonly computedAt: string;
}

export interface SwapResult {
  readonly input: SwapInput;
  readonly fixedLeg: LegResult;
  readonly floatingLeg: LegResult | null;
  /** Fisso meno variabile, dal lato di chi paga fisso. Nullo senza gamba variabile. */
  readonly netTotal: number | null;
  readonly warnings: readonly string[];
  readonly audit: SwapAudit;
}

export type SwapOutcome =
  | { readonly ok: true; readonly result: SwapResult }
  | { readonly ok: false; readonly reason: string };
