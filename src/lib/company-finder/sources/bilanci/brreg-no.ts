// ---------- Brønnøysundregistrene — Norvegia: Regnskapsregisteret ----------
// API ufficiale per copie dei bilanci annuali. Le copie sono PDF e sono
// disponibili per gli ultimi 15 anni secondo la documentazione del servizio.

import type { FinancialDocumentSummary, Financials } from "../../types";

const BASE = "https://data.brreg.no/regnskapsregisteret/regnskap/aarsregnskap/kopi";

export interface BrregFinancialResult {
  ok: boolean;
  data?: Financials | undefined;
  error?: string | undefined;
}

export interface BrregAnnualReportDocument {
  ok: boolean;
  bytes?: ArrayBuffer | undefined;
  error?: string | undefined;
}

export function brregOrgFromInput(value: string): string | undefined {
  const digits = value.replace(/\D/g, "");
  return /^\d{9}$/.test(digits) ? digits : undefined;
}

export function brregAnnualReportUrl(orgnr: string, year: number): string {
  const code = brregOrgFromInput(orgnr);
  if (!code || !Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("org.nr o anno non valido");
  }
  return `${BASE}/${code}/${year}`;
}

export function brregInternalDocumentUrl(orgnr: string, year: number, download = false): string {
  const code = brregOrgFromInput(orgnr);
  if (!code || !Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("org.nr o anno non valido");
  }
  return (
    `/api/company-finder/document?country=NO&company=${encodeURIComponent(code)}&year=${year}` +
    (download ? "&download=1" : "")
  );
}

function asYear(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : undefined;
}

/**
 * Accetta sia array di anni sia wrapper oggettuali e oggetti anno usati dalle
 * diverse versioni del servizio aperto. Il risultato è sempre deterministico.
 */
export function parseBrregAnnualYears(payload: unknown): number[] {
  const candidates: unknown[] = [];
  if (Array.isArray(payload)) candidates.push(...payload);
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of [
      "aar",
      "år",
      "years",
      "availableYears",
      "available_years",
      "regnskapsaar",
      "regnskapsår",
    ]) {
      const value = record[key];
      if (Array.isArray(value)) candidates.push(...value);
    }
    // Alcune rappresentazioni espongono direttamente una singola lista in
    // `data`, per cui la trattiamo come ulteriore contenitore noto.
    if (Array.isArray(record["data"])) candidates.push(...record["data"]);
  }
  const years = candidates
    .flatMap((value) => {
      if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return [record["aar"], record["år"], record["year"], record["regnskapsaar"], record["regnskapsår"]];
      }
      return [value];
    })
    .map(asYear)
    .filter((year): year is number => year !== undefined);
  return [...new Set(years)].sort((a, b) => b - a);
}

export function isBrregPdf(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 5) return false;
  return new TextDecoder("latin1").decode(new Uint8Array(bytes).slice(0, 5)) === "%PDF-";
}

async function fetchWithTimeout(url: string, timeoutMs: number, accept: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { Accept: accept },
      signal: ctrl.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBrregAnnualReports(
  orgnr: string,
  timeoutMs = 15000,
): Promise<BrregFinancialResult> {
  const code = brregOrgFromInput(orgnr);
  if (!code) return { ok: false, error: "org.nr norvegese non valido: servono esattamente 9 cifre" };

  try {
    const response = await fetchWithTimeout(`${BASE}/${code}/aar`, timeoutMs, "application/json");
    if (response.status === 404) {
      return {
        ok: true,
        data: {
          available: false,
          years: [],
          source: `Brønnøysundregistrene — Regnskapsregisteret (${code})`,
          availability: "REGISTRY_ONLY",
          note: "Nessun bilancio annuale risulta disponibile per questo org.nr.",
          documents: [],
        },
      };
    }
    if (!response.ok) return { ok: false, error: `Regnskapsregisteret HTTP ${response.status}` };

    const payload = (await response.json()) as unknown;
    const years = parseBrregAnnualYears(payload);
    const documents: FinancialDocumentSummary[] = years.map((year) => ({
      id: `NO-${code}-${year}`,
      year,
      kind: "ANNUAL_REPORT",
      format: "pdf",
      availability: "DOCUMENT_DOWNLOADABLE",
      title: `Årsregnskap ${year} — organisasjonsnummer ${code}`,
      downloadUrl: brregInternalDocumentUrl(code, year, true),
    }));

    return {
      ok: true,
      data: {
        available: documents.length > 0,
        currency: "NOK",
        years: years.map((year) => ({
          periodLabel: `Regnskapsår ${year}`,
          year,
          currency: "NOK",
        })),
        source: `Brønnøysundregistrene — Regnskapsregisteret (${code})`,
        availability: documents.length > 0 ? "DOCUMENT_DOWNLOADABLE" : "REGISTRY_ONLY",
        documentUrl: years[0] ? brregInternalDocumentUrl(code, years[0], false) : undefined,
        documentTitle: years[0]
          ? `Årsregnskap ${years[0]} — organisasjonsnummer ${code}`
          : undefined,
        note: documents.length
          ? `Copie ufficiali dei bilanci disponibili per ${documents.length} esercizi.`
          : "Nessuna copia di årsregnskap disponibile per questo org.nr.",
        documents,
      },
    };
  } catch (e) {
    const err = e as { name?: string; message?: string };
    return {
      ok: false,
      error: err?.name === "AbortError" ? "Regnskapsregisteret: timeout" : (err?.message ?? "errore di rete"),
    };
  }
}

export async function fetchBrregAnnualReportDocument(
  orgnr: string,
  year: number,
  timeoutMs = 25000,
): Promise<BrregAnnualReportDocument> {
  const code = brregOrgFromInput(orgnr);
  if (!code || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, error: "org.nr o anno non valido" };
  }
  try {
    const response = await fetchWithTimeout(brregAnnualReportUrl(code, year), timeoutMs, "application/pdf");
    if (!response.ok) return { ok: false, error: `Regnskapsregisteret HTTP ${response.status}` };
    const bytes = await response.arrayBuffer();
    if (!isBrregPdf(bytes)) return { ok: false, error: "Regnskapsregisteret non ha restituito un PDF valido" };
    return { ok: true, bytes };
  } catch (e) {
    const err = e as { name?: string; message?: string };
    return {
      ok: false,
      error: err?.name === "AbortError" ? "Regnskapsregisteret: timeout" : (err?.message ?? "errore di rete"),
    };
  }
}
