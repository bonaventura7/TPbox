// ---------- Slovacchia: Register účtovných závierok (RÚZ) — Open API ----------
// API UFFICIALE, GRATUITA, senza chiave né registrazione (documentata su
// https://www.registeruz.sk/cruz-public/home/api). Catena verificata in
// produzione su U. S. Steel Košice (IČO 36199222):
//
//   1. GET /cruz-public/api/uctovne-jednotky?zmenene-od=2000-01-01&ico={IČO}
//      (obbligatorio zmenene-od; alternativa dic={DIČ})  → { "id": [460474] }
//   2. GET /cruz-public/api/uctovna-jednotka?id={id}     → nazovUJ, ico, dic,
//      idUctovnychZavierok[] (omesso se non ci sono závierky pubbliche)
//   3. GET /cruz-public/api/uctovna-zavierka?id={id}     → obdobieOd/Do
//      (RRRR-MM), typ, datumSchvalenia, idUctovnychVykazov[]
//
// Documento: per ogni závierka il PDF ufficiale dei dati strutturati è
// pubblicato dall'applicazione su
//   /cruz-public/domain/financialreport/pdf/{id-výkazu}
// (URL documentata nelle note API: contenuto dati identico al dettaglio JSON).
// Servita in pagina dal proxy del tool, mai reindirizzamento esterno.
//
// Identificativi: IČO = 8 cifre; DIČ = 10 cifre (la partita IVA slovacca è
// SK + DIČ, quindi arriva dal campo IVA già senza prefisso).
//
// Scope consapevole: i VALORI di bilancio vivono in šablóny di výkaz specifiche
// per forma giuridica — estrarli richiede la mappatura dei číselníky; è il
// passo successivo (analogo alla nota XBRL nel provider danese).

import type { FinancialDocumentSummary, Financials, FinancialYear } from "../../types";

const BASE = "https://www.registeruz.sk/cruz-public";

export interface SkIdentifier {
  kind: "ico" | "dic";
  value: string;
}

interface SkZavierka {
  id: number;
  obdobieOd?: string | undefined;
  obdobieDo?: string | undefined;
  typ?: string | undefined;
  idUctovnychVykazov: number[];
}

export interface SkResult {
  ok: boolean;
  data?: Financials | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

/** IČO (8 cifre) oppure DIČ/partita IVA (10 cifre, prefisso SK già rimosso). */
export function skIdentifierFromInput(localVat: string): SkIdentifier | undefined {
  const v = localVat.replace(/\s/g, "");
  if (/^\d{8}$/.test(v)) return { kind: "ico", value: v };
  if (/^\d{10}$/.test(v)) return { kind: "dic", value: v };
  return undefined;
}

function yearOf(z: SkZavierka): number | undefined {
  const m = (z.obdobieDo ?? "").match(/^(\d{4})-/);
  return m ? Number(m[1]) : undefined;
}

function periodLabel(z: SkZavierka): string {
  const end = (z.obdobieDo ?? "").slice(0, 4);
  const start = (z.obdobieOd ?? "").slice(0, 4);
  if (end && start && end !== start) return `Esercizio ${start}/${end}`;
  if (end) return `Esercizio ${end}`;
  return "Esercizio non datato";
}

async function getJson<T>(url: string, timeoutMs: number): Promise<T | { error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return { error: `RÚZ HTTP ${res.status}` };
    return (await res.json()) as T;
  } catch (e) {
    const err = e as { name?: string | undefined; message?: string | undefined };
    return {
      error: err?.name === "AbortError" ? "RÚZ: timeout" : (err?.message ?? "RÚZ: errore di rete"),
    };
  } finally {
    clearTimeout(timer);
  }
}

function isError<T>(value: T | { error: string }): value is { error: string } {
  return typeof (value as { error?: unknown }).error === "string";
}

/** Catena completa: identificativo → entità → závierky recenti → documenti. */
export async function fetchSkZavierky(id: SkIdentifier, timeoutMs = 12000): Promise<SkResult> {
  const list = await getJson<{ id?: number[] }>(
    `${BASE}/api/uctovne-jednotky?zmenene-od=2000-01-01&max-zaznamov=1&${id.kind}=${id.value}`,
    timeoutMs,
  );
  if (isError(list)) return { ok: false, error: list.error };
  const entityId = list.id?.[0];
  if (entityId === undefined) {
    return {
      ok: false,
      error: `nessuna účtovná jednotka RÚZ per ${id.kind.toUpperCase()} ${id.value}`,
    };
  }

  const engagement = await getJson<{
    nazovUJ?: string;
    idUctovnychZavierok?: number[];
  }>(`${BASE}/api/uctovna-jednotka?id=${entityId}`, timeoutMs);
  if (isError(engagement)) return { ok: false, error: engagement.error };

  const zavierkaIds = engagement.idUctovnychZavierok ?? [];
  if (zavierkaIds.length === 0) {
    return {
      ok: false,
      error: `${engagement.nazovUJ ?? id.value}: nessuna účtovná závierka pubblica in RÚZ`,
    };
  }

  const details = await Promise.all(
    zavierkaIds.slice(0, 8).map((zid) =>
      getJson<{
        id?: number;
        obdobieOd?: string;
        obdobieDo?: string;
        typ?: string;
        idUctovnychVykazov?: number[];
      }>(`${BASE}/api/uctovna-zavierka?id=${zid}`, timeoutMs),
    ),
  );
  const zavierky: SkZavierka[] = [];
  for (const d of details) {
    if (isError(d) || d.id === undefined) continue;
    zavierky.push({
      id: d.id,
      ...(d.obdobieOd ? { obdobieOd: d.obdobieOd } : {}),
      ...(d.obdobieDo ? { obdobieDo: d.obdobieDo } : {}),
      ...(d.typ ? { typ: d.typ } : {}),
      idUctovnychVykazov: d.idUctovnychVykazov ?? [],
    });
  }
  if (zavierky.length === 0) {
    return { ok: false, error: "RÚZ: dettagli delle závierky non raggiungibili" };
  }

  zavierky.sort((a, b) => (b.obdobieDo ?? "").localeCompare(a.obdobieDo ?? ""));
  const latest = zavierky.slice(0, 3);

  const documents: FinancialDocumentSummary[] = latest
    .filter((z) => z.idUctovnychVykazov.length > 0)
    .map((z) => {
      const vykazId = z.idUctovnychVykazov[0]!;
      const url = `${BASE}/domain/financialreport/pdf/${vykazId}`;
      return {
        id: `ruz-${z.id}`,
        ...(yearOf(z) ? { year: yearOf(z)! } : {}),
        kind: "ANNUAL_REPORT" as const,
        format: "pdf" as const,
        availability: "DOCUMENT_DOWNLOADABLE" as const,
        title: `Účetná závierka — ${periodLabel(z)}${z.typ ? ` (${z.typ})` : ""}`,
        downloadUrl: `/api/company-finder/document?url=${encodeURIComponent(url)}`,
      };
    });

  const years: FinancialYear[] = latest.map((z) => ({
    periodLabel: periodLabel(z),
    ...(yearOf(z) ? { year: yearOf(z)! } : {}),
    currency: "EUR",
  }));

  const newestDoc = documents[0];
  const data: Financials = {
    available: true,
    currency: "EUR",
    years,
    source: `Register účtovných závierok — RÚZ Open API (${engagement.nazovUJ ?? id.value})`,
    availability: newestDoc ? "DOCUMENT_DOWNLOADABLE" : "DOCUMENT_FOUND",
    documents,
    ...(newestDoc
      ? {
          documentUrl: newestDoc.downloadUrl,
          documentTitle: newestDoc.title,
        }
      : {}),
    note:
      `${engagement.nazovUJ ?? id.value}: ${zavierkaIds.length} závierky pubbliche in RÚZ` +
      ", PDF ufficiale dei dati strutturati servito in pagina per gli ultimi 3 esercizi. " +
      "Fonte ufficiale del Ministero della Giustizia slovacco, gratuita e senza registrazione.",
  };
  return { ok: true, data };
}
