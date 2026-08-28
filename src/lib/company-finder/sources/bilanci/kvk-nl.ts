// ---------- KVK Open Dataset Jaarrekeningen — Paesi Bassi ----------
// API UFFICIALE GRATUITA (senza chiave) della Kamer van Koophandel:
//   GET https://opendata.kvk.nl/api/v1/hvds/jaarrekeningen/kvknummer/{8 cifre}
// Restituisce le annualità (jaarrekeningen) depositate in XBRL:
// bilancio (activa, eigen vermogen, resultaat) e conto economico.
//
// NB: il KVK-nummer NON è contenuto nel numero IVA (verificato su Philips:
// VAT NL002065538B01 vs KVK 17001910). L'utente inserisce il KVK-nummer
// (8 cifre) direttamente nel campo partita IVA; in alternativa la chiave
// OpenCorporates risolve nome → KVK.
//
// Rate limit ufficiale: 1 richiesta/minuto per IP (150/5min globali) —
// l'orchestratore la esegue una sola volta per ricerca.

import type { FinancialYear, Financials } from "../../types";

// ATTENZIONE: il KVK-nummer è un PARAMETRO DI PATH (come da OpenAPI ufficiale),
// NON un query parameter. La forma ?kvkNummer= restituisce sempre 404.
const KVK_API = "https://opendata.kvk.nl/api/v1/hvds/jaarrekeningen/kvknummer";

export interface KvkResult {
  ok: boolean;
  data?: Financials | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

// L'output HVDS è un albero di "opendataFields" (key/value + sottogruppi).
// Forma reale (dal campione ufficiale KVK):
//   { opendataFields: [
//       { key: "FinancialYear", value: "2024" },
//       { key: "DocumentAdoptionDate", value: "2025-01-01" },
//       { key: "BalanceSheet", opendataFields: [
//           { key: "Assets", value: 123 }, { key: "Equity", value: 45 }, ... ] },
//       { key: "IncomeStatement", opendataFields: [
//           { key: "ResultAfterTax", value: 7 }, ... ] },
//       ... ] }
// La risposta può essere un singolo oggetto (un esercizio) o un array (più).

interface OpendataField {
  key?: string | undefined;
  value?: string | number | null | undefined;
  opendataFields?: OpendataField[] | undefined;
}

interface KvkDoc {
  opendataFields?: OpendataField[] | undefined;
}

/** Cerca un campo (per key) RICORSIVAMENTE in un albero opendataFields.
 *  I valori reali sono annidati più livelli sotto gruppi tipo
 *  "BalanceSheetTitle" > "EquityAndLiabilitiesTitle" > "EquityAndLiabilities". */
function fieldValue(fields: OpendataField[] | undefined, key: string): number | undefined {
  if (!fields) return undefined;
  for (const f of fields) {
    if (f.key === key) {
      const v = f.value;
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string") {
        const n = Number(v.replace(/[^\d.-]/g, ""));
        if (Number.isFinite(n)) return n;
      }
      return undefined;
    }
    if (f.opendataFields) {
      const found = fieldValue(f.opendataFields, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** Prende il primo gruppo (per key) presente. */
function group(fields: OpendataField[] | undefined, key: string): OpendataField[] | undefined {
  if (!fields) return undefined;
  const g = fields.find((f) => f.key === key);
  return g?.opendataFields;
}

function num(v: number | undefined): number | undefined {
  return v !== undefined && Number.isFinite(v) ? v : undefined;
}

/**
 * KVK-nummer (8 cifre): l'utente lo inserisce direttamente nel campo
 * "partita IVA" (8 cifre pure). NB: il numero IVA olandese NON contiene
 * il KVK-nummer (verificato su Philips: VAT NL002065538B01 vs KVK 17001910) —
 * la derivazione da IVA non è affidabile e non viene eseguita.
 * In alternativa la chiave OpenCorporates risolve nome → KVK.
 */
export function kvkFromInput(localVat: string): string | undefined {
  if (/^\d{8}$/.test(localVat.replace(/\s/g, ""))) return localVat.replace(/\s/g, "");
  return undefined;
}

/**
 * Parsa il payload HVDS (oggetto o array di oggetti con "opendataFields")
 * in annualità ordinate per esercizio decrescente. Null se non ci sono dati.
 * Exportata per test unitari (es. sul campione ufficiale KVK).
 */
export function parseKvkPayload(raw: unknown): FinancialYear[] | null {
  const docs: KvkDoc[] = Array.isArray(raw)
    ? (raw as KvkDoc[])
    : raw && typeof raw === "object"
      ? [raw as KvkDoc]
      : [];
  if (!docs.some((d) => d.opendataFields?.length)) return null;

  const rows = docs
    .map((d) => {
      const fields = d.opendataFields ?? [];
      const year = String(fieldValue(fields, "FinancialYear") ?? "");
      const bs = group(fields, "ConsolidatedBalanceSheet") ?? group(fields, "BalanceSheet");
      const inc = group(fields, "ConsolidatedIncomeStatement") ?? group(fields, "IncomeStatement");
      const assets = num(fieldValue(bs, "Assets"));
      const equity = num(fieldValue(bs, "Equity"));
      // Micro-imprese: spesso depositano solo "Totaal passiva" (patrimonio + passività)
      const le = num(fieldValue(bs, "EquityAndLiabilities"));
      return {
        year,
        totalAssets: assets,
        equity,
        liabilitiesAndEquity:
          le !== undefined && assets === undefined && equity === undefined ? le : undefined,
        netIncome: num(fieldValue(bs, "ResultForTheYear") ?? fieldValue(inc, "ResultAfterTax")),
        operatingProfit: num(fieldValue(inc, "OperatingResult")),
        revenue: num(
          fieldValue(inc, "Revenue") ??
            fieldValue(inc, "Turnover") ??
            fieldValue(inc, "GrossMargin"),
        ),
      };
    })
    .filter((r) => r.year)
    .sort((a, b) => b.year.localeCompare(a.year))
    .slice(0, 5);

  if (rows.length === 0) return null;

  return rows.map((r) => ({
    periodLabel: `Esercizio ${r.year}`,
    revenue: r.revenue,
    operatingProfit: r.operatingProfit,
    netIncome: r.netIncome,
    totalAssets: r.totalAssets,
    equity: r.equity,
    liabilitiesAndEquity: r.liabilitiesAndEquity,
    currency: "EUR" as const,
  }));
}

export async function fetchKvkJaarrekeningen(
  kvkNummer: string,
  timeoutMs = 20000,
): Promise<KvkResult> {
  if (!/^\d{8}$/.test(kvkNummer)) return { ok: false, error: "KVK-nummer non valido (8 cifre)" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `${KVK_API}/${encodeURIComponent(kvkNummer)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "TPbox-CompanyFinder/1.0" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status === 429) {
      return { ok: false, error: "KVK: rate limit (1 req/min per IP) — riprova tra un minuto" };
    }
    if (res.status === 404)
      return {
        ok: false,
        error: "KVK: nessuna annualità depositata in XBRL per questo KVK-nummer",
      };
    if (!res.ok) return { ok: false, error: `KVK HTTP ${res.status}` };

    const json = await res.json();
    const years = parseKvkPayload(json);
    if (!years) {
      return {
        ok: false,
        error: "KVK: nessuna annualità depositata in XBRL per questo KVK-nummer",
      };
    }

    return {
      ok: true,
      data: {
        available: years.length > 0,
        currency: "EUR",
        years,
        source: "KVK Handelsregister — Open Dataset Jaarrekeningen (ufficiale, gratuito)",
        note: "Valori dalle annualità (jaarrekening) depositate in formato XBRL presso la KVK. Le micro-imprese depositano in forma abbreviata: in alcuni esercizi è presente solo il totale passiva (patrimonio + passività).",
      },
    };
  } catch (e) {
    const err = e as { name?: string | undefined; message?: string } | undefined;
    return {
      ok: false,
      error: err?.name === "AbortError" ? "KVK: timeout" : `KVK: ${err?.message ?? "errore"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
