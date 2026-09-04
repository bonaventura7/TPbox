/**
 * Curva dei rendimenti del Tesoro statunitense (daily par yield curve, CMT).
 *
 * Fonte primaria e senza chiavi API: il feed XML ufficiale del Dipartimento del
 * Tesoro, lo stesso documento da cui derivano le serie DGS ripubblicate da FRED.
 * Sostituisce FRED sulla gamba in dollari del differenziale per due ragioni
 * verificate in produzione: da `iad1` le serie FRED andavano in timeout anche a
 * 8 s, e cinque scadenze (3M, 6M, 1Y, 3Y, 7Y) non erano state verificabili.
 *
 * Il feed pubblica un mese per volta e una riga al giorno contiene tutte le
 * scadenze: una sola richiesta copre quindi l'intera curva, a differenza delle
 * fonti per serie.
 *
 * Scadenze pubblicate (nota metodologica del Tesoro): 1, 1,5, 2, 3, 4 e 6 mesi,
 * poi 1, 2, 3, 5, 7, 10, 20 e 30 anni. Il portale ne usa otto.
 */
import type { Observation } from "./as-of";
import { SourceFormatError } from "./csv";

export const TREASURY_FEED =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml";

/** Nome del dataset nel feed: curva nominale a scadenza costante. */
const TREASURY_DATASET = "daily_treasury_yield_curve";

/** Campi del feed usati dal portale, nel vocabolario del Tesoro. */
export const TREASURY_FIELDS = [
  "BC_3MONTH",
  "BC_6MONTH",
  "BC_1YEAR",
  "BC_2YEAR",
  "BC_3YEAR",
  "BC_5YEAR",
  "BC_7YEAR",
  "BC_10YEAR",
] as const;

export type TreasuryField = (typeof TREASURY_FIELDS)[number];

/** Chiave mese del feed (`202609`) per una data ISO. */
export function treasuryMonthKey(isoDate: string): string {
  const month = /^(\d{4})-(\d{2})/.exec(isoDate);
  if (month?.[1] === undefined || month[2] === undefined) {
    throw new SourceFormatError(`data non leggibile per il feed del Tesoro: ${isoDate}`);
  }
  return `${month[1]}${month[2]}`;
}

/** Mese precedente, con passaggio d'anno: `202601` -> `202512`. */
export function previousMonthKey(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(4, 6));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new SourceFormatError(`mese non valido per il feed del Tesoro: ${monthKey}`);
  }
  return month === 1 ? `${year - 1}12` : `${year}${String(month - 1).padStart(2, "0")}`;
}

export function treasuryFeedUrl(monthKey: string): string {
  const query = new URLSearchParams({
    data: TREASURY_DATASET,
    field_tdr_date_value_month: monthKey,
  });
  return `${TREASURY_FEED}?${query.toString()}`;
}

/**
 * Valore numerico dell'elemento `field` nel segmento di una riga, `null` se
 * l'elemento manca o non contiene un numero (il feed usa `N/A` per le scadenze
 * non pubblicate).
 *
 * La ricerca e' sul nome locale dell'elemento, quindi tollera qualunque prefisso
 * di namespace (`<d:BC_5YEAR>`, `<BC_5YEAR>`) e ignora l'ordine dei campi: un
 * campo rinominato o spostato dalla fonte non sposta i valori sulle scadenze
 * sbagliate, semplicemente non vengono trovati.
 */
function tagValue(segment: string, field: string): number | null {
  const match = new RegExp(`<(?:[\\w.-]+:)?${field}\\b[^>]*>([^<]*)<`, "i").exec(segment);
  const raw = match?.[1]?.trim();
  if (raw === undefined || raw === "" || raw.toUpperCase() === "N/A") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Osservazioni del feed per campo, indicizzate per nome del campo.
 *
 * Le righe si riconoscono dall'elemento `NEW_DATE`, che apre ogni record: il
 * documento viene diviso su quell'elemento e ogni tratto contiene la data e i
 * valori della giornata. Se la struttura non e' quella attesa il parser
 * solleva un errore invece di restituire una curva vuota e silenziosa.
 */
export function parseTreasuryXml(text: string): Readonly<Record<string, Observation[]>> {
  const starts = [...text.matchAll(/<(?:[\w.-]+:)?NEW_DATE\b[^>]*>/gi)];
  if (starts.length === 0) {
    throw new SourceFormatError(
      "Tesoro USA: nessuna riga NEW_DATE nella risposta (feed cambiato o vuoto)",
    );
  }
  const out: Record<string, Observation[]> = {};
  for (let index = 0; index < starts.length; index += 1) {
    const match = starts[index];
    if (match?.index === undefined) continue;
    const from = match.index + match[0].length;
    const to = starts[index + 1]?.index ?? text.length;
    const segment = text.slice(from, to);
    const period = segment
      .slice(0, Math.max(segment.indexOf("<"), 0))
      .trim()
      .slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) continue;
    for (const field of TREASURY_FIELDS) {
      const value = tagValue(segment, field);
      if (value === null) continue;
      const series = (out[field] ??= []);
      series.push({ period, value });
    }
  }
  if (Object.keys(out).length === 0) {
    throw new SourceFormatError("Tesoro USA: nessuna scadenza riconosciuta nella risposta");
  }
  return out;
}
