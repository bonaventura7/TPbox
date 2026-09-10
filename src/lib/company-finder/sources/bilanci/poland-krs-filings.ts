// ---------- KRS — Polonia: elenco ufficiale dei bilanci depositati ----------
//
// Workaround LECITO per le società NON quotate (per le quotate resta ESEF /
// filings.xbrl.org). L'API aperta del Portal Rejestrów Sądowych
//   https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/{krs}?rejestr=P&format=json
// espone nel Dział 3 le "wzmianki o złożeniu sprawozdania finansowego": per ogni
// esercizio depositato riporta periodo e data di deposito. È la stessa fonte
// ministeriale già usata da `krs.ts` — nessun WAF, nessun browser, nessun
// parametro cifrato: solo un endpoint JSON pubblico e documentato.
//
// Cosa NON facciamo qui (e perché): il PDF/XBRL vero del bilancio vive sul
// portale gemello RDF (rdf-przegladarka.ms.gov.pl), che è una SPA protetta
// (403 alle richieste dirette) e va pilotata con un browser reale. Da un
// prodotto server-side (Vercel) non è replicabile senza aggirare i controlli
// d'accesso: resta quindi come consultazione istituzionale (deep-link). Qui
// estraiamo invece la PROVA registry-backed di quali esercizi hanno un bilancio
// depositato, con data di deposito e flag "sottoposto a revisione".

import type { Financials, FinancialDocumentSummary } from "../../types";

const BASE = "https://api-krs.ms.gov.pl/api/krs";
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 3;
const RETRIABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_YEARS = 15;

export interface KrsFilingEntry {
  /** Anno di esercizio (chiusura), es. 2024. */
  year: number;
  /** Etichetta leggibile del periodo, es. "01.01.2024 – 31.12.2024". */
  periodLabel: string;
  /** Data di deposito (ISO YYYY-MM-DD), quando presente. */
  filedOn?: string | undefined;
  /** true se per lo stesso esercizio risulta depositata l'opinione del revisore. */
  audited: boolean;
}

export interface KrsFilingsResult {
  ok: boolean;
  data?: Financials | undefined;
  entries?: KrsFilingEntry[] | undefined;
  error?: string | undefined;
  notFound?: boolean | undefined;
  skipped?: boolean | undefined;
}

/** "26.04.2002" -> "2002-04-26"; passa oltre qualunque formato inatteso. */
function plDateToIso(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const m = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

/**
 * Estrae l'anno di esercizio da `zaOkresOdDo`, che nel registro compare in più
 * dialetti storici:
 *   "OD 01.01.2024 DO 31.12.2024"  → 2024 (anno della data DI CHIUSURA)
 *   "ROK OBROTOWY 2008"            → 2008
 *   "2009 ROK"                     → 2009
 * Regola difensiva: se c'è un intervallo, l'esercizio è l'anno della data finale
 * (chiusura); altrimenti si prende l'anno a 4 cifre presente nella stringa.
 */
export function krsFiscalYear(zaOkresOdDo: unknown): number | undefined {
  if (typeof zaOkresOdDo !== "string") return undefined;
  const raw = zaOkresOdDo.trim();
  const range = raw.match(/DO\s+\d{2}\.\d{2}\.(\d{4})/i);
  if (range) {
    const y = Number(range[1]);
    return Number.isInteger(y) && y >= 1990 && y <= 2100 ? y : undefined;
  }
  const years = [...raw.matchAll(/(19|20)\d{2}/g)].map((mm) => Number(mm[0]));
  if (years.length === 0) return undefined;
  // Un solo anno per una wzmianka: prendi l'ultimo (per i rari "OD ... 2023 ...").
  const y = years[years.length - 1]!;
  return y >= 1990 && y <= 2100 ? y : undefined;
}

/** Etichetta di periodo leggibile a partire da `zaOkresOdDo`. */
function periodLabel(zaOkresOdDo: string, year: number): string {
  const range = zaOkresOdDo.match(/OD\s+(\d{2}\.\d{2}\.\d{4})\s+DO\s+(\d{2}\.\d{2}\.\d{4})/i);
  if (range) return `${range[1]} – ${range[2]}`;
  return `esercizio ${year}`;
}

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

/**
 * Parsa l'odpis KRS (oggetto già deserializzato) e ricava l'elenco dei bilanci
 * depositati. Modulo puro: nessuna rete, testabile su fixture. Ritorna gli
 * esercizi ordinati dal più recente, deduplicati, con flag di revisione.
 */
export function parseKrsFilings(odpisRoot: unknown): KrsFilingEntry[] {
  const odpis =
    odpisRoot && typeof odpisRoot === "object"
      ? ((odpisRoot as Record<string, unknown>)["odpis"] ?? odpisRoot)
      : undefined;
  if (!odpis || typeof odpis !== "object") return [];

  const dzial3 = (((odpis as Record<string, unknown>)["dane"] as Record<string, unknown>)?.[
    "dzial3"
  ] ?? {}) as Record<string, unknown>;
  const wzmianki = (dzial3["wzmiankiOZlozonychDokumentach"] ?? {}) as Record<string, unknown>;

  const financialStatements = asArray(wzmianki["wzmiankaOZlozeniuRocznegoSprawozdaniaFinansowego"]);
  const auditOpinions = asArray(
    wzmianki["wzmiankaOZlozeniuOpiniiBieglegoRewidentaSprawozdaniaZBadania"],
  );

  // Insieme degli esercizi con opinione del revisore depositata → auditata.
  const auditedYears = new Set<number>();
  for (const op of auditOpinions) {
    const y = krsFiscalYear((op as Record<string, unknown>)?.["zaOkresOdDo"]);
    if (y) auditedYears.add(y);
  }

  const byYear = new Map<number, KrsFilingEntry>();
  for (const item of financialStatements) {
    const rec = item as Record<string, unknown>;
    const zaOkres = rec["zaOkresOdDo"];
    const year = krsFiscalYear(zaOkres);
    if (!year) continue;
    const filedOn = plDateToIso(rec["dataZlozenia"]);
    const existing = byYear.get(year);
    if (existing) {
      // Duplicati storici o correzioni: tieni la data di deposito più recente.
      if (filedOn && (!existing.filedOn || filedOn > existing.filedOn)) {
        existing.filedOn = filedOn;
      }
      continue;
    }
    byYear.set(year, {
      year,
      periodLabel: typeof zaOkres === "string" ? periodLabel(zaOkres, year) : `esercizio ${year}`,
      filedOn,
      audited: auditedYears.has(year),
    });
  }

  return [...byYear.values()].sort((a, b) => b.year - a.year).slice(0, MAX_YEARS);
}

/**
 * Costruisce la struttura `Financials` pronta per il client a partire dagli
 * esercizi depositati. Nessun valore numerico (il registro riporta solo la
 * PROVA di deposito, non le poste): `available:false`, disponibilità
 * REGISTRY_ONLY e un documento per esercizio marcato come consultabile sul
 * portale RDF ufficiale.
 */
export function buildKrsFilingsFinancials(entries: KrsFilingEntry[]): Financials | undefined {
  if (entries.length === 0) return undefined;
  const documents: FinancialDocumentSummary[] = entries.map((e) => ({
    id: `KRS-RDF-${e.year}`,
    year: e.year,
    kind: "ANNUAL_REPORT" as const,
    format: "unknown" as const,
    availability: "REGISTRY_ONLY" as const,
    restriction: "SESSION_BOUND" as const,
    title:
      `Roczne sprawozdanie finansowe ${e.year}` +
      (e.filedOn ? ` — depositato il ${e.filedOn}` : "") +
      (e.audited ? " (sottoposto a revisione)" : ""),
  }));

  const latest = entries[0]!;
  return {
    available: false,
    years: entries.map((e) => ({ periodLabel: e.periodLabel, year: e.year, currency: "PLN" })),
    source: "KRS — Repozytorium Dokumentów Finansowych (Ministerstwo Sprawiedliwości)",
    note:
      `Il registro conferma ${entries.length} ${entries.length === 1 ? "bilancio depositato" : "bilanci depositati"} ` +
      `(più recente: esercizio ${latest.year}${latest.filedOn ? `, depositato il ${latest.filedOn}` : ""}). ` +
      "I documenti sono consultabili e scaricabili gratuitamente dal Repozytorium Dokumentów Finansowych; " +
      "il download automatico non è possibile perché il portale richiede una sessione browser.",
    availability: "REGISTRY_ONLY",
    restriction: "SESSION_BOUND",
    documents,
  };
}

async function getWithRetry(url: string, timeoutMs: number): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (RETRIABLE_STATUS.has(res.status) && attempt < MAX_RETRIES - 1) {
        lastError = new Error(`HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
    // Backoff esponenziale con jitter.
    const backoff = 250 * 2 ** attempt + Math.floor(Math.random() * 200);
    await new Promise((r) => setTimeout(r, backoff));
  }
  throw lastError ?? new Error("KRS filings: richiesta non riuscita");
}

/**
 * Recupera dall'API KRS l'elenco ufficiale dei bilanci depositati per un numero
 * di KRS (8 o 10 cifre; viene normalizzato con zero-padding a 10). Orchestrazione
 * ad alta resilienza: timeout, retry con backoff, degrado onesto in caso di
 * errore o assenza di depositi.
 */
export async function fetchPolishKrsFilings(
  krsNumber: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<KrsFilingsResult> {
  const krs = krsNumber.replace(/\D/g, "").padStart(10, "0");
  if (!/^\d{10}$/.test(krs)) return { ok: false, skipped: true, error: "KRS non valido" };

  let res: Response;
  try {
    res = await getWithRetry(`${BASE}/OdpisAktualny/${krs}?rejestr=P&format=json`, timeoutMs);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "KRS: errore di rete" };
  }

  if (res.status === 204 || res.status === 404) {
    return { ok: false, notFound: true, error: `KRS ${krs} non trovato` };
  }
  if (!res.ok) return { ok: false, error: `KRS HTTP ${res.status}` };

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: "KRS: risposta non valida" };
  }

  const entries = parseKrsFilings(json);
  if (entries.length === 0) {
    return { ok: false, skipped: true, error: "Nessun bilancio depositato nel registro KRS" };
  }
  const data = buildKrsFilingsFinancials(entries);
  return { ok: true, data, entries };
}
