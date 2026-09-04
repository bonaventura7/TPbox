/**
 * Registry delle metriche di mercato.
 *
 * Ogni metrica dichiara fonte, chiave della serie, unita' e stato di verifica.
 * `verified: true` significa che la chiave e' stata interrogata e ha risposto
 * con dati. `verified: false` marca le serie aggiunte per estendere la copertura
 * senza una verifica diretta: se la chiave fosse errata la metrica risulta
 * UNAVAILABLE, mai un valore stimato.
 *
 * Nessuna chiave API: BCE SDMX, FRED CSV e Treasury XML sono endpoint pubblici.
 */
import type { MarketSource, MetricKind } from "./types";

export const ECB_BASE = "https://data-api.ecb.europa.eu/service/data";
export const FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=";
export const DAMODARAN_CTRYPREM = "https://www.stern.nyu.edu/~adamodar/pc/datasets/ctryprem.xlsx";
export const TREASURY_XML = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml";

export interface Metric {
  readonly id: string;
  readonly label: string;
  readonly kind: MetricKind;
  readonly source: MarketSource;
  readonly series: string;
  readonly flow: string;
  readonly unit: string;
  readonly pair: string;
  readonly note: string;
  readonly verified: boolean;
}

export function sourceUrlFor(metric: Metric): string {
  if (metric.source === "ECB") return `${ECB_BASE}/${metric.flow}/${metric.series}`;
  if (metric.source === "FRED") return `${FRED_CSV}${metric.series}`;
  if (metric.source === "TREASURY") return TREASURY_XML;
  return DAMODARAN_CTRYPREM;
}

function fx(currency: string, name: string): Metric {
  return {
    id: `FX_EUR_${currency}`,
    label: `EUR/${currency} spot`,
    kind: "fx",
    source: "ECB",
    series: `D.${currency}.EUR.SP00.A`,
    flow: "EXR",
    unit: `${currency} per EUR`,
    pair: `EUR/${currency}`,
    note: `Tasso di cambio di riferimento BCE, giornaliero (${name}).`,
    verified: true,
  };
}

export const FX_METRICS: readonly Metric[] = [
  fx("USD", "dollaro statunitense"),
  fx("GBP", "sterlina"),
  fx("CHF", "franco svizzero"),
  fx("JPY", "yen"),
  fx("AUD", "dollaro australiano"),
  fx("CAD", "dollaro canadese"),
  fx("CNY", "renminbi"),
  fx("HKD", "dollaro di Hong Kong"),
  fx("SEK", "corona svedese"),
  fx("NOK", "corona norvegese"),
  fx("PLN", "zloty"),
  fx("MXN", "peso messicano"),
] as const;

function ecbRate(id: string, label: string, flow: string, series: string, note: string): Metric {
  return { id, label, kind: "rate", source: "ECB", series, flow, unit: "percent", pair: "", note, verified: true };
}

function fredRate(id: string, label: string, series: string, note: string, verified = true): Metric {
  return { id, label, kind: "rate", source: "FRED", series, flow: "", unit: "percent", pair: "", note, verified };
}

function treasuryRate(id: string, label: string, series: string, note: string): Metric {
  return { id, label, kind: "rate", source: "TREASURY", series, flow: "", unit: "percent", pair: "", note, verified: true };
}

const MONEY_AND_CREDIT_METRICS: readonly Metric[] = [
  ecbRate("EURIBOR_3M_M", "Euribor 3M — media mensile", "FM", "M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA", "Media del mese (HSTA). Le serie Euribor giornaliere non sono esposte dall'attuale data API BCE con le chiavi note."),
  ecbRate("EURIBOR_6M_M", "Euribor 6M — media mensile", "FM", "M.U2.EUR.RT.MM.EURIBOR6MD_.HSTA", "Media del mese (HSTA)."),
  ecbRate("EURIBOR_1Y_M", "Euribor 12M — media mensile", "FM", "M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA", "Media del mese (HSTA)."),
  ecbRate("EURIBOR_1Y_Q", "Euribor 12M — media trimestrale", "FM", "Q.U2.EUR.RT.MM.EURIBOR1YD_.HSTA", "Media del trimestre (HSTA)."),
  ecbRate("MIR_IT_NFC_GT1M_U3M", "Tasso bancario Italia — imprese, oltre 1 mln EUR, fixing fino a 3M", "MIR", "M.IT.B.A2A.D.R.1.2240.EUR.N", "MFI interest rate statistics, nuove operazioni, tasso annuo effettivo. Da confermare sul portale BCE che la riga A2A corrisponda a fixing fisso."),
  ecbRate("MIR_U2_NFC_GT1M_U3M", "Tasso bancario area euro — imprese, oltre 1 mln EUR, fixing fino a 3M", "MIR", "M.U2.B.A2A.D.R.1.2240.EUR.N", "Come la serie italiana, riferita all'area euro: utile come confronto."),
  fredRate("SOFR", "SOFR — overnight USD", "SOFR", "Secured Overnight Financing Rate, New York Fed via FRED."),
  fredRate("SONIA", "SONIA — overnight GBP", "IUDSOIA", "Sterling Overnight Index Average, Bank of England via FRED."),
  treasuryRate("US_TREASURY_3M", "Treasury USA 3 mesi", "BC_3MONTH", "Treasury Daily Par Yield Curve, constant maturity; fonte primaria U.S. Treasury."),
  treasuryRate("US_TREASURY_6M", "Treasury USA 6 mesi", "BC_6MONTH", "Treasury Daily Par Yield Curve, constant maturity; fonte primaria U.S. Treasury."),
  treasuryRate("US_TREASURY_1Y", "Treasury USA 1 anno", "BC_1YEAR", "Treasury Daily Par Yield Curve, constant maturity; fonte primaria U.S. Treasury."),
  treasuryRate("US_TREASURY_2Y", "Treasury USA 2 anni", "BC_2YEAR", "Treasury Daily Par Yield Curve, constant maturity; fonte primaria U.S. Treasury."),
  treasuryRate("US_TREASURY_3Y", "Treasury USA 3 anni", "BC_3YEAR", "Treasury Daily Par Yield Curve, constant maturity; fonte primaria U.S. Treasury."),
  treasuryRate("US_TREASURY_5Y", "Treasury USA 5 anni", "BC_5YEAR", "Treasury Daily Par Yield Curve, constant maturity; fonte primaria U.S. Treasury."),
  treasuryRate("US_TREASURY_7Y", "Treasury USA 7 anni", "BC_7YEAR", "Treasury Daily Par Yield Curve, constant maturity; fonte primaria U.S. Treasury."),
  treasuryRate("US_TREASURY_10Y", "Treasury USA 10 anni", "BC_10YEAR", "Treasury Daily Par Yield Curve, constant maturity; fonte primaria U.S. Treasury."),
  fredRate("MOODYS_BAA_D", "Corporate Baa — rendimento (giornaliero)", "DBAA", "Moody's seasoned Baa corporate bond yield."),
  fredRate("MOODYS_AAA_M", "Corporate Aaa — rendimento (mensile)", "AAA", "Moody's seasoned Aaa corporate bond yield."),
  fredRate("EURO_HY_OAS", "Euro high yield — OAS", "BAMLHE00EHYIOAS", "ICE BofA Euro High Yield Index, option-adjusted spread."),
  fredRate("US_HY_OAS", "US high yield — OAS", "BAMLH0A0HYM2", "ICE BofA US High Yield Index, option-adjusted spread."),
  fredRate("US_IG_OAS", "US investment grade — OAS", "BAMLC0A0CM", "ICE BofA US Corporate Index, option-adjusted spread."),
] as const;

function ecbYieldCurve(tenor: TenorId, suffix: string): Metric {
  return {
    id: `EA_GOVT_${tenor}`,
    label: `Rendimento titoli di stato area euro ${tenor}`,
    kind: "rate",
    source: "ECB",
    series: `B.U2.EUR.4F.G_N_A.SV_C_YM.SR_${suffix}`,
    flow: "YC",
    unit: "percent",
    pair: "",
    note: "Curva dei rendimenti dell'area euro, titoli di stato con rating AAA, tasso spot. Chiave verificata in produzione: la serie risponde con dati.",
    verified: true,
  };
}

export const EA_YIELD_CURVE_METRICS: readonly Metric[] = [
  ecbYieldCurve("3M", "3M"), ecbYieldCurve("6M", "6M"), ecbYieldCurve("1Y", "1Y"), ecbYieldCurve("2Y", "2Y"),
  ecbYieldCurve("3Y", "3Y"), ecbYieldCurve("5Y", "5Y"), ecbYieldCurve("7Y", "7Y"), ecbYieldCurve("10Y", "10Y"),
] as const;

export const RATE_METRICS: readonly Metric[] = [...MONEY_AND_CREDIT_METRICS, ...EA_YIELD_CURVE_METRICS];

export const COUNTRY_METRIC: Metric = {
  id: "DAMODARAN_IT",
  label: "Country risk Italia — Damodaran (NYU Stern)",
  kind: "country",
  source: "DAMODARAN",
  series: "ctryprem.xlsx",
  flow: "",
  unit: "frazioni",
  pair: "",
  note: "Rating, default spread, equity risk premium e CDS a 10 anni. Il file viene aggiornato una volta l'anno, a gennaio.",
  verified: true,
};

export const ALL_METRICS: readonly Metric[] = [...FX_METRICS, ...RATE_METRICS, COUNTRY_METRIC];
const BY_ID = new Map(ALL_METRICS.map((metric) => [metric.id, metric]));
const BY_PAIR = new Map(FX_METRICS.map((metric) => [metric.pair, metric]));

export function metricById(id: string): Metric | null { return BY_ID.get(id) ?? null; }
export function fxMetricForPair(pair: string): Metric | null { return BY_PAIR.get(pair.toUpperCase()) ?? null; }

export const FX_CURRENCIES: readonly string[] = ["EUR", ...FX_METRICS.map((metric) => metric.pair.split("/")[1] ?? "")].filter((code) => code.length === 3);

export type TenorId = "3M" | "6M" | "9M" | "1Y" | "2Y" | "3Y" | "4Y" | "5Y" | "6Y" | "7Y" | "8Y" | "9Y" | "10Y";
export const TENORS: readonly { readonly id: TenorId; readonly years: number }[] = [
  { id: "3M", years: 0.25 }, { id: "6M", years: 0.5 }, { id: "9M", years: 0.75 }, { id: "1Y", years: 1 }, { id: "2Y", years: 2 },
  { id: "3Y", years: 3 }, { id: "4Y", years: 4 }, { id: "5Y", years: 5 }, { id: "6Y", years: 6 }, { id: "7Y", years: 7 },
  { id: "8Y", years: 8 }, { id: "9Y", years: 9 }, { id: "10Y", years: 10 },
] as const;

export const REFERENCE_RATES: Readonly<Record<string, Readonly<Partial<Record<TenorId, string>>>>> = {
  EUR: { "3M": "EA_GOVT_3M", "6M": "EA_GOVT_6M", "1Y": "EA_GOVT_1Y", "2Y": "EA_GOVT_2Y", "3Y": "EA_GOVT_3Y", "5Y": "EA_GOVT_5Y", "7Y": "EA_GOVT_7Y", "10Y": "EA_GOVT_10Y" },
  USD: { "3M": "US_TREASURY_3M", "6M": "US_TREASURY_6M", "1Y": "US_TREASURY_1Y", "2Y": "US_TREASURY_2Y", "3Y": "US_TREASURY_3Y", "5Y": "US_TREASURY_5Y", "7Y": "US_TREASURY_7Y", "10Y": "US_TREASURY_10Y" },
};

export function referenceRateId(currency: string, tenor: TenorId): string | null { return REFERENCE_RATES[currency.toUpperCase()]?.[tenor] ?? null; }

export const REFERENCE_BASIS_NOTE = "Rendimenti di titoli di stato alla stessa scadenza: curva dell'area euro (titoli AAA, BCE) per l'euro, Treasury constant maturity (U.S. Treasury Daily Par Yield Curve) per il dollaro.";
export const DIFFERENTIAL_CURRENCIES: readonly string[] = Object.keys(REFERENCE_RATES);
