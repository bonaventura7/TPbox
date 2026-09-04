/**
 * Registry delle metriche di mercato.
 *
 * Ogni metrica dichiara fonte, chiave della serie, unita' e stato di verifica.
 * `verified: true` significa che la chiave e' stata interrogata e ha risposto
 * con dati (BCE e FRED, verifica del 2026-09-03, riportata nello snapshot
 * congelato; Tesoro USA, verifica del 2026-09-04 descritta in
 * `US_TREASURY_NOTE`). `verified: false` marca le serie aggiunte per estendere
 * la copertura dei tenor senza una verifica diretta: se la chiave fosse errata
 * la metrica risulta UNAVAILABLE, mai un valore stimato.
 *
 * Nessuna chiave API: BCE SDMX e FRED espongono CSV pubblici, il Tesoro USA un
 * feed XML pubblico.
 */
import { todayIso } from "./as-of";
import { treasuryFeedUrl, treasuryMonthKey, type TreasuryField } from "./treasury";
import type { MarketSource, MetricKind } from "./types";

export const ECB_BASE = "https://data-api.ecb.europa.eu/service/data";
export const FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=";
export const DAMODARAN_CTRYPREM = "https://www.stern.nyu.edu/~adamodar/pc/datasets/ctryprem.xlsx";

export interface Metric {
  readonly id: string;
  readonly label: string;
  readonly kind: MetricKind;
  readonly source: MarketSource;
  /** Chiave SDMX (BCE), series id (FRED) oppure campo del feed (Tesoro USA). */
  readonly series: string;
  /** Dataflow SDMX: EXR, FM, MIR. Vuoto per FRED e per il Tesoro. */
  readonly flow: string;
  readonly unit: string;
  /** Coppia di cambio, solo per le metriche fx. */
  readonly pair: string;
  readonly note: string;
  readonly verified: boolean;
}

export function sourceUrlFor(metric: Metric, at: string = todayIso()): string {
  if (metric.source === "ECB") return `${ECB_BASE}/${metric.flow}/${metric.series}`;
  if (metric.source === "FRED") return `${FRED_CSV}${metric.series}`;
  if (metric.source === "TREASURY") {
    // Il feed pubblica un mese per volta: l'indirizzo punta al mese della
    // osservazione, non a quello di oggi, perche' sia quello che la contiene.
    const month = /^\d{4}-\d{2}/.test(at) ? treasuryMonthKey(at) : treasuryMonthKey(todayIso());
    return treasuryFeedUrl(month);
  }
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
  return {
    id,
    label,
    kind: "rate",
    source: "ECB",
    series,
    flow,
    unit: "percent",
    pair: "",
    note,
    verified: true,
  };
}

function fredRate(
  id: string,
  label: string,
  series: string,
  note: string,
  verified = true,
): Metric {
  return {
    id,
    label,
    kind: "rate",
    source: "FRED",
    series,
    flow: "",
    unit: "percent",
    pair: "",
    note,
    verified,
  };
}

/**
 * Curva a scadenza costante del Tesoro USA, dal feed XML ufficiale.
 *
 * Verifica del 2026-09-04: i campi `BC_*` sono quelli dello schema del feed e i
 * valori letti alla riga del 2026-09-01 (2Y 4,39 — 5Y 4,55 — 10Y 4,79) sono
 * identici a quelli delle serie FRED `DGS2`, `DGS5`, `DGS10` congelate nello
 * snapshot, che da quella stessa curva derivano.
 */
const US_TREASURY_NOTE =
  "Curva dei rendimenti a scadenza costante del Tesoro USA (daily par yield curve), feed XML ufficiale: stessa fonte primaria da cui derivano le serie DGS.";

function treasuryRate(id: string, label: string, field: TreasuryField, tenor: string): Metric {
  return {
    id,
    label,
    kind: "rate",
    source: "TREASURY",
    series: field,
    flow: "",
    unit: "percent",
    pair: "",
    note: `${US_TREASURY_NOTE} Scadenza ${tenor}.`,
    verified: true,
  };
}

const MONEY_AND_CREDIT_METRICS: readonly Metric[] = [
  ecbRate(
    "EURIBOR_3M_M",
    "Euribor 3M — media mensile",
    "FM",
    "M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA",
    "Media del mese (HSTA). Le serie Euribor giornaliere non sono esposte dall'attuale data API BCE con le chiavi note (verifica del 2026-09-03).",
  ),
  ecbRate(
    "EURIBOR_6M_M",
    "Euribor 6M — media mensile",
    "FM",
    "M.U2.EUR.RT.MM.EURIBOR6MD_.HSTA",
    "Media del mese (HSTA).",
  ),
  ecbRate(
    "EURIBOR_1Y_M",
    "Euribor 12M — media mensile",
    "FM",
    "M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA",
    "Media del mese (HSTA).",
  ),
  ecbRate(
    "EURIBOR_1Y_Q",
    "Euribor 12M — media trimestrale",
    "FM",
    "Q.U2.EUR.RT.MM.EURIBOR1YD_.HSTA",
    "Media del trimestre (HSTA).",
  ),
  ecbRate(
    "MIR_IT_NFC_GT1M_U3M",
    "Tasso bancario Italia — imprese, oltre 1 mln EUR, fixing fino a 3M",
    "MIR",
    "M.IT.B.A2A.D.R.1.2240.EUR.N",
    "MFI interest rate statistics, nuove operazioni, tasso annuo effettivo. Da confermare sul portale BCE che la riga A2A corrisponda a fixing fisso.",
  ),
  ecbRate(
    "MIR_U2_NFC_GT1M_U3M",
    "Tasso bancario area euro — imprese, oltre 1 mln EUR, fixing fino a 3M",
    "MIR",
    "M.U2.B.A2A.D.R.1.2240.EUR.N",
    "Come la serie italiana, riferita all'area euro: utile come confronto.",
  ),
  fredRate(
    "SOFR",
    "SOFR — overnight USD",
    "SOFR",
    "Secured Overnight Financing Rate, New York Fed via FRED.",
  ),
  fredRate(
    "SONIA",
    "SONIA — overnight GBP",
    "IUDSOIA",
    "Sterling Overnight Index Average, Bank of England via FRED.",
  ),
  treasuryRate("US_TREASURY_3M", "Treasury USA 3 mesi", "BC_3MONTH", "3 mesi"),
  treasuryRate("US_TREASURY_6M", "Treasury USA 6 mesi", "BC_6MONTH", "6 mesi"),
  treasuryRate("US_TREASURY_1Y", "Treasury USA 1 anno", "BC_1YEAR", "1 anno"),
  treasuryRate("US_TREASURY_2Y", "Treasury USA 2 anni", "BC_2YEAR", "2 anni"),
  treasuryRate("US_TREASURY_3Y", "Treasury USA 3 anni", "BC_3YEAR", "3 anni"),
  treasuryRate("US_TREASURY_5Y", "Treasury USA 5 anni", "BC_5YEAR", "5 anni"),
  treasuryRate("US_TREASURY_7Y", "Treasury USA 7 anni", "BC_7YEAR", "7 anni"),
  treasuryRate("US_TREASURY_10Y", "Treasury USA 10 anni", "BC_10YEAR", "10 anni"),
  fredRate(
    "MOODYS_BAA_D",
    "Corporate Baa — rendimento (giornaliero)",
    "DBAA",
    "Moody's seasoned Baa corporate bond yield.",
  ),
  fredRate(
    "MOODYS_AAA_M",
    "Corporate Aaa — rendimento (mensile)",
    "AAA",
    "Moody's seasoned Aaa corporate bond yield.",
  ),
  fredRate(
    "EURO_HY_OAS",
    "Euro high yield — OAS",
    "BAMLHE00EHYIOAS",
    "ICE BofA Euro High Yield Index, option-adjusted spread.",
  ),
  fredRate(
    "US_HY_OAS",
    "US high yield — OAS",
    "BAMLH0A0HYM2",
    "ICE BofA US High Yield Index, option-adjusted spread.",
  ),
  fredRate(
    "US_IG_OAS",
    "US investment grade — OAS",
    "BAMLC0A0CM",
    "ICE BofA US Corporate Index, option-adjusted spread.",
  ),
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
  ecbYieldCurve("3M", "3M"),
  ecbYieldCurve("6M", "6M"),
  ecbYieldCurve("1Y", "1Y"),
  ecbYieldCurve("2Y", "2Y"),
  ecbYieldCurve("3Y", "3Y"),
  ecbYieldCurve("5Y", "5Y"),
  ecbYieldCurve("7Y", "7Y"),
  ecbYieldCurve("10Y", "10Y"),
] as const;

/** Tutte le metriche di tasso: mercato monetario, credito e curve governative. */
export const RATE_METRICS: readonly Metric[] = [
  ...MONEY_AND_CREDIT_METRICS,
  ...EA_YIELD_CURVE_METRICS,
];

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

export function metricById(id: string): Metric | null {
  return BY_ID.get(id) ?? null;
}

export function fxMetricForPair(pair: string): Metric | null {
  return BY_PAIR.get(pair.toUpperCase()) ?? null;
}

/** Valute con un cambio di riferimento BCE nel registry (EUR compresa). */
export const FX_CURRENCIES: readonly string[] = [
  "EUR",
  ...FX_METRICS.map((metric) => metric.pair.split("/")[1] ?? ""),
].filter((code) => code.length === 3);

export type TenorId =
  "3M" | "6M" | "9M" | "1Y" | "2Y" | "3Y" | "4Y" | "5Y" | "6Y" | "7Y" | "8Y" | "9Y" | "10Y";

export const TENORS: readonly { readonly id: TenorId; readonly years: number }[] = [
  { id: "3M", years: 0.25 },
  { id: "6M", years: 0.5 },
  { id: "9M", years: 0.75 },
  { id: "1Y", years: 1 },
  { id: "2Y", years: 2 },
  { id: "3Y", years: 3 },
  { id: "4Y", years: 4 },
  { id: "5Y", years: 5 },
  { id: "6Y", years: 6 },
  { id: "7Y", years: 7 },
  { id: "8Y", years: 8 },
  { id: "9Y", years: 9 },
  { id: "10Y", years: 10 },
] as const;

/**
 * Tasso di riferimento per valuta e tenor, usato dal metodo del differenziale.
 *
 * Le due gambe devono essere omogenee, altrimenti il differenziale incorpora
 * anche la differenza fra strumenti: si usano quindi rendimenti di titoli di
 * stato alla stessa scadenza su entrambi i lati, non un tasso interbancario
 * contro un titolo di stato.
 *
 * EUR: curva dei rendimenti dell'area euro, titoli AAA (BCE, dataflow YC).
 * USD: curva a scadenza costante del Tesoro USA (feed XML ufficiale, campi
 * `BC_*`), fonte primaria e senza chiavi API.
 *
 * La copertura e' dichiarata: dove manca una serie per la valuta e il tenor il
 * metodo si blocca, senza ripiegare su una scadenza diversa. Le altre valute
 * non hanno, nel registry, una curva governativa gratuita per tenor.
 */
export const REFERENCE_RATES: Readonly<Record<string, Readonly<Partial<Record<TenorId, string>>>>> =
  {
    EUR: {
      "3M": "EA_GOVT_3M",
      "6M": "EA_GOVT_6M",
      "1Y": "EA_GOVT_1Y",
      "2Y": "EA_GOVT_2Y",
      "3Y": "EA_GOVT_3Y",
      "5Y": "EA_GOVT_5Y",
      "7Y": "EA_GOVT_7Y",
      "10Y": "EA_GOVT_10Y",
    },
    USD: {
      "3M": "US_TREASURY_3M",
      "6M": "US_TREASURY_6M",
      "1Y": "US_TREASURY_1Y",
      "2Y": "US_TREASURY_2Y",
      "3Y": "US_TREASURY_3Y",
      "5Y": "US_TREASURY_5Y",
      "7Y": "US_TREASURY_7Y",
      "10Y": "US_TREASURY_10Y",
    },
  };

export function referenceRateId(currency: string, tenor: TenorId): string | null {
  return REFERENCE_RATES[currency.toUpperCase()]?.[tenor] ?? null;
}

/** Basi del differenziale, per la nota metodologica in pagina. */
export const REFERENCE_BASIS_NOTE =
  "Rendimenti di titoli di stato alla stessa scadenza: curva dell'area euro (titoli AAA, BCE) per l'euro, curva a scadenza costante del Tesoro USA (feed XML ufficiale, fonte primaria senza chiavi API) per il dollaro.";

/** Valute con almeno un tasso di riferimento a termine nel registry. */
export const DIFFERENTIAL_CURRENCIES: readonly string[] = Object.keys(REFERENCE_RATES);
