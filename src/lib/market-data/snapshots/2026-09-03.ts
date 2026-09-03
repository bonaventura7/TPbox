/**
 * Snapshot congelato del 2026-09-03.
 *
 * Valori scaricati dalle fonti pubbliche (BCE SDMX, FRED, Damodaran) dal
 * backend TP Market Data e riportati qui senza modifiche. Servono a due cose:
 *  - far funzionare lo strumento quando una fonte non risponde, dichiarando che
 *    il valore e' CACHED e da quale data proviene;
 *  - dare un dataset deterministico ai test.
 *
 * Snapshot di origine: hash f8dbe7840479569bbe14239ded2a5ec5bdb94078016d6c63ed4098ffc8f048f4
 * (12 cambi, 16 tassi e il country risk, tutti con stato OK).
 *
 * Le serie aggiunte al registry dopo questa data non compaiono qui: si
 * risolvono solo dal vivo, altrimenti restano UNAVAILABLE.
 */
import type { CountryRisk } from "../types";

export interface SnapshotPoint {
  readonly value: number;
  /** Data o periodo dell'osservazione: `2026-09-03`, `2026-08`, `2026-Q2`. */
  readonly asOf: string;
}

export const SNAPSHOT_VERSION = "tp-market-data-2026-09-03.v1";
export const SNAPSHOT_DATE = "2026-09-03";
export const SNAPSHOT_BUILT_AT = "2026-09-03T14:07:22Z";
export const SNAPSHOT_ORIGIN_HASH =
  "f8dbe7840479569bbe14239ded2a5ec5bdb94078016d6c63ed4098ffc8f048f4";

export const SNAPSHOT_FX: Readonly<Record<string, SnapshotPoint>> = {
  "EUR/AUD": { value: 1.6147, asOf: "2026-09-03" },
  "EUR/CAD": { value: 1.6019, asOf: "2026-09-03" },
  "EUR/CHF": { value: 0.939, asOf: "2026-09-03" },
  "EUR/CNY": { value: 7.8042, asOf: "2026-09-03" },
  "EUR/GBP": { value: 0.86055, asOf: "2026-09-03" },
  "EUR/HKD": { value: 9.1078, asOf: "2026-09-03" },
  "EUR/JPY": { value: 181.21, asOf: "2026-09-03" },
  "EUR/MXN": { value: 19.7593, asOf: "2026-09-03" },
  "EUR/NOK": { value: 10.8063, asOf: "2026-09-03" },
  "EUR/PLN": { value: 4.3265, asOf: "2026-09-03" },
  "EUR/SEK": { value: 11.1245, asOf: "2026-09-03" },
  "EUR/USD": { value: 1.1615, asOf: "2026-09-03" },
};

export const SNAPSHOT_RATES: Readonly<Record<string, SnapshotPoint>> = {
  EURIBOR_3M_M: { value: 2.5131429, asOf: "2026-08" },
  EURIBOR_6M_M: { value: 2.7133333, asOf: "2026-08" },
  EURIBOR_1Y_M: { value: 2.9536667, asOf: "2026-08" },
  EURIBOR_1Y_Q: { value: 2.7833387, asOf: "2026-Q2" },
  MIR_IT_NFC_GT1M_U3M: { value: 3.3, asOf: "2026-07" },
  MIR_U2_NFC_GT1M_U3M: { value: 3.49, asOf: "2026-07" },
  SOFR: { value: 3.65, asOf: "2026-09-02" },
  SONIA: { value: 3.7302, asOf: "2026-09-01" },
  US_TREASURY_2Y: { value: 4.39, asOf: "2026-09-01" },
  US_TREASURY_5Y: { value: 4.55, asOf: "2026-09-01" },
  US_TREASURY_10Y: { value: 4.79, asOf: "2026-09-01" },
  MOODYS_BAA_D: { value: 6.37, asOf: "2026-09-01" },
  MOODYS_AAA_M: { value: 5.88, asOf: "2026-08-01" },
  EURO_HY_OAS: { value: 2.6, asOf: "2026-09-01" },
  US_HY_OAS: { value: 2.65, asOf: "2026-09-01" },
  US_IG_OAS: { value: 0.81, asOf: "2026-09-01" },
};

export const SNAPSHOT_COUNTRY: { readonly data: CountryRisk; readonly asOf: string } = {
  data: {
    country: "Italy",
    ratingMoodys: "Baa2",
    defaultSpread: 0.016180901401917473,
    totalErp: 0.06694963134550559,
    countryRiskPremium: 0.024649631345505598,
    cds10y: 0.0061,
  },
  asOf: "2026-01-01",
};
