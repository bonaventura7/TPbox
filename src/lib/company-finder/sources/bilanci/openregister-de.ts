// ---------- Germania: OpenRegister — anagrafiche e bilanci strutturati ----------
// OpenRegister rivende in forma strutturata i depositi del Bundesanzeiger /
// Unternehmensregister. A differenza di Estonia, Regno Unito e Danimarca
// QUESTA FONTE RICHIEDE UNA CHIAVE: `OPENREGISTER_API_KEY`, inviata come
// `Authorization: Bearer`. Va detto perche' cambia il profilo del paese: se la
// chiave manca, la Germania non ha un canale alternativo gratuito qui dentro.
//
//   1. GET https://api.openregister.de/v1/autocomplete/company?query=<nome>
//      -> { results: [{ company_id, name, country, legal_form, register_* }] }
//   2. GET https://api.openregister.de/v1/company/<company_id>/financials
//      -> { indicators: [...], merged: {...}, reports: [...] }
//
// `company_id` ha forma "DE-HRB-T3104-6000" (tipo di registro + tribunale +
// numero) e NON coincide con la partita IVA tedesca: si arriva al codice solo
// passando dall'autocomplete sul nome.
//
// Nessun controllo tecnico viene aggirato: si usa l'API del fornitore con la
// propria chiave, alle sue condizioni. Non si tocca ne' il Bundesanzeiger ne'
// l'Unternehmensregister direttamente.
//
// LIMITI MISURATI (2026-09-17), da tenere presenti prima di fidarsi:
//   - Gli importi sono in CENTESIMI e il payload non dichiara l'unita'.
//     Vedi `indicatorMoney` piu' sotto, che porta la misura su BASF SE.
//   - L'autocomplete sceglie l'entita' sbagliata su nomi ovvi: "Siemens AG"
//     restituisce un'associazione di azionisti (404 sui bilanci), "Volkswagen
//     AG" la controllata assicurativa. La selezione della societa' giusta e'
//     un problema aperto, non risolto da questo adapter.
//   - La chiave risponde 403 dopo circa 8 richieste ravvicinate: i test usano
//     payload registrati, mai chiamate live.

import type { FinancialDocumentSummary, Financials } from "../../types";

const API_BASE = "https://api.openregister.de";

type JsonObject = Record<string, unknown>;

type OpenRegisterCompany = {
  company_id?: string;
  name?: string;
  country?: string;
  register_number?: string;
  register_type?: string;
  register_court?: string;
  legal_form?: string;
  active?: boolean;
};

type Indicator = JsonObject & {
  date?: string;
  report_id?: string;
};

export interface OpenRegisterResult {
  ok: boolean;
  data?: Financials;
  error?: string;
  skipped?: string;
}

function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s/g, "");
  if (!normalized) return undefined;
  const european = /^-?[\d.]+,\d+$/.test(normalized);
  const cleaned = european
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized.replace(/,/g, "");
  const parsed = Number(cleaned.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

// Token di forma giuridica tedesca: si tolgono prima di confrontare i nomi, cosi'
// "Siemens AG" e "Siemens Aktiengesellschaft" hanno lo stesso nucleo ("siemens").
const DE_LEGAL_TOKENS = new Set([
  "ag", "aktiengesellschaft", "se", "gmbh", "mbh", "kg", "kgaa", "ohg", "ug",
  "gbr", "eg", "ev", "co", "kgaakg", "partg",
]);

function deCoreName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !DE_LEGAL_TOKENS.has(token))
    .join("");
}

/**
 * Somiglianza sul NUCLEO del nome (senza forma giuridica). Un match esatto del
 * nucleo vale piu' di un prefisso: cosi' "Siemens AG" -> "Siemens
 * Aktiengesellschaft" (nucleo "siemens" = "siemens", 1.0) batte "Siemens
 * Healthineers AG" (nucleo "siemenshealthineers", solo prefisso).
 */
function coreSimilarity(candidateName: string, query: string): number {
  const c = deCoreName(candidateName);
  const q = deCoreName(query);
  if (!c || !q) return 0;
  if (c === q) return 1;
  if (c.startsWith(q) || q.startsWith(c)) return 0.6;
  if (c.includes(q) || q.includes(c)) return 0.4;
  return 0;
}

// VR = Vereinsregister, ev = eingetragener Verein: sono ASSOCIAZIONI, non
// imprese. "Siemens AG" restituiva "Verein von Belegschaftsaktionaeren in der
// Siemens AG" perche' aveva "siemens" nel nome. Vanno squalificate.
function isAssociation(candidate: OpenRegisterCompany): boolean {
  return (
    (candidate.register_type ?? "").toUpperCase() === "VR" ||
    (candidate.legal_form ?? "").toLowerCase() === "ev"
  );
}

// "AG" nella query non viene espanso dall'autocomplete di OpenRegister, che
// cerca il nome REGISTRATO ("...Aktiengesellschaft"). Misurato 2026-09-17:
// "Siemens AG" non restituisce la Siemens AG madre, "Siemens Aktiengesellschaft"
// si'. Si prova quindi anche la forma estesa.
function expandQueries(query: string): string[] {
  const q = query.trim();
  const out = [q];
  const agSuffix = /\bAG\b\.?\s*$/i;
  if (agSuffix.test(q)) {
    const expanded = q.replace(agSuffix, "Aktiengesellschaft").trim();
    if (expanded && expanded.toLowerCase() !== q.toLowerCase()) out.push(expanded);
  }
  return out;
}

async function getJson(url: string, apiKey: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "TPbox-Company-Finder/1.0",
    },
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`OpenRegister HTTP ${response.status}`);
  return response.json();
}

async function autocomplete(
  query: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<OpenRegisterCompany[]> {
  const params = new URLSearchParams({ query });
  const payload = asObject(
    await getJson(`${API_BASE}/v1/autocomplete/company?${params.toString()}`, apiKey, signal),
  );
  const results = Array.isArray(payload?.["results"]) ? payload["results"] : [];
  return (results.map(asObject).filter(Boolean) as JsonObject[]).map(
    (row) => row as OpenRegisterCompany,
  );
}

/**
 * Punteggio composito. Il nucleo del nome domina; a parita' di nucleo vincono
 * impresa attiva, registro commerciale (HRB) e nomi non-filiale. Le
 * associazioni sono gia' state escluse a monte.
 */
function candidateScore(candidate: OpenRegisterCompany, query: string): number {
  let score = coreSimilarity(candidate.name ?? "", query) * 100;
  if (candidate.active === false) score -= 8;
  if ((candidate.register_type ?? "").toUpperCase() === "HRB") score += 3;
  if (/zweigniederlassung|niederlassung/i.test(candidate.name ?? "")) score -= 6;
  return score;
}

// Sotto questa soglia nessun candidato "somiglia" davvero al nome cercato: meglio
// dichiarare l'indisponibilita' che restituire una controllata plausibile ma
// sbagliata (principio: mai una falsa conferma).
const MIN_CORE_SCORE = 55;

async function searchCompany(
  query: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<OpenRegisterCompany | undefined> {
  const seen = new Set<string>();
  const candidates: OpenRegisterCompany[] = [];
  for (const q of expandQueries(query)) {
    for (const candidate of await autocomplete(q, apiKey, signal)) {
      if (candidate.country && candidate.country.toUpperCase() !== "DE") continue;
      if (isAssociation(candidate)) continue;
      const id = candidate.company_id ?? candidate.name ?? "";
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      candidates.push(candidate);
    }
  }

  let best: OpenRegisterCompany | undefined;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const score = candidateScore(candidate, query);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore >= MIN_CORE_SCORE ? best : undefined;
}

function indicatorYear(dateValue: unknown): number | undefined {
  const date = text(dateValue);
  if (!date) return undefined;
  const match = date.match(/(20\d{2})/);
  return match ? Number(match[1]) : undefined;
}

/**
 * OpenRegister espone gli importi in CENTESIMI di euro e non dichiara l'unita':
 * il payload di /v1/company/{id}/financials non contiene `unit`, `currency` ne'
 * `EUR`, quindi la scala va dedotta dalla misura.
 *
 * Misurato su BASF SE (DE-HRB-T3104-6000), esercizio chiuso al 2025-12-31:
 *   revenue             5.965.700.000.000 -> 59,657 mld EUR
 *   balance_sheet_total 7.617.400.000.000 -> 76,174 mld EUR
 *   equity              3.433.800.000.000 -> 34,338 mld EUR
 *   net_income            172.600.000.000 ->  1,726 mld EUR
 * I valori grezzi darebbero a BASF un fatturato di 5,97 mila miliardi di euro,
 * superiore al PIL tedesco: impossibile. A /100 ogni riga combacia col bilancio
 * pubblicato.
 *
 * Vale SOLO per i campi monetari. `employees` (105.588 nello stesso payload) e'
 * un conteggio e non va scalato: non passa di qui.
 */
const CENTS_PER_EUR = 100;

function indicatorMoney(indicator: Indicator, key: string): number | undefined {
  const cents = numberValue(indicator[key]);
  return cents === undefined ? undefined : cents / CENTS_PER_EUR;
}

function reportEndYear(report: JsonObject): number | undefined {
  return indicatorYear(report["report_end_date"] ?? report["report_date"] ?? report["date"]);
}

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return /[;\r\n\"]/g.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

type ReportRow = JsonObject & {
  name?: string;
  formatted_name?: string;
  current_value?: number | string | null;
  previous_value?: number | string | null;
  children?: unknown;
};

function flattenRows(rows: unknown, path: string[], output: string[], section: string): void {
  if (!Array.isArray(rows)) return;
  for (const raw of rows) {
    const row = asObject(raw) as ReportRow | undefined;
    if (!row) continue;
    const label = text(row.formatted_name) ?? text(row.name) ?? "Voce senza descrizione";
    const nextPath = [...path, label];
    output.push(
      [
        csvCell(section),
        csvCell(nextPath.join(" > ")),
        csvCell(row.current_value),
        csvCell(row.previous_value),
      ].join(";"),
    );
    flattenRows(row.children, nextPath, output, section);
  }
}

/** Serializza un report OpenRegister in un CSV leggibile e scaricabile. */
export function buildOpenRegisterFinancialCsv(report: JsonObject, companyName: string): string {
  const lines = [
    ["Società", csvCell(companyName)].join(";"),
    ["Data inizio", csvCell(report["report_start_date"])].join(";"),
    ["Data fine", csvCell(report["report_end_date"])].join(";"),
    "",
    ["Sektion", "Position", "Aktueller Wert", "Vorjahreswert"].join(";"),
  ];

  const sections: Array<[string, string]> = [
    ["Aktiva", "aktiva"],
    ["Passiva", "passiva"],
    ["GuV", "guv"],
  ];

  for (const [label, key] of sections) {
    const table = asObject(report[key]);
    if (!table) continue;
    const before = lines.length;
    flattenRows(table["rows"], [], lines, label);
    if (lines.length > before) lines.splice(before, 0, [csvCell(label), "", "", ""].join(";"));
  }

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function buildDownloadDocument(
  company: OpenRegisterCompany,
  companyId: string,
  report: JsonObject,
): FinancialDocumentSummary | undefined {
  const reportId = text(report["report_id"]);
  if (!reportId) return undefined;
  const year = reportEndYear(report);
  const params = new URLSearchParams({ companyId, reportId });
  return {
    id: reportId,
    year,
    kind: "ANNUAL_REPORT",
    format: "csv",
    availability: "DOCUMENT_DOWNLOADABLE",
    title: `${company.name ?? "Società tedesca"}${year ? ` - Bilancio ${year}` : " - Bilancio"}`,
    downloadUrl: `/api/company-finder/openregister-financials?${params.toString()}`,
  };
}

export async function fetchOpenRegisterFinancialsByCompanyId(
  companyId: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<unknown> {
  return getJson(`${API_BASE}/v1/company/${encodeURIComponent(companyId)}/financials`, apiKey, signal);
}

export function getOpenRegisterCompanyName(companyId: string): string {
  return companyId;
}

export function reportList(payload: unknown): JsonObject[] {
  const root = asObject(payload);
  return (Array.isArray(root?.["reports"]) ? root["reports"] : [])
    .map(asObject)
    .filter(Boolean) as JsonObject[];
}

function mapFinancials(
  company: OpenRegisterCompany,
  companyId: string,
  payload: unknown,
): Financials | undefined {
  const root = asObject(payload);
  const indicators = Array.isArray(root?.["indicators"])
    ? (root["indicators"].map(asObject).filter(Boolean) as Indicator[])
    : [];
  const reports = reportList(payload);

  if (indicators.length === 0 && reports.length === 0) return undefined;

  const years = indicators
    .map((indicator) => {
      const date = text(indicator.date);
      const year = indicatorYear(date);
      const balanceSheetTotal = indicatorMoney(indicator, "balance_sheet_total");
      const revenue = indicatorMoney(indicator, "revenue");
      const operatingProfit = indicatorMoney(indicator, "ebit");
      const ebitda = indicatorMoney(indicator, "ebitda");
      const netIncome = indicatorMoney(indicator, "net_income");
      const equity = indicatorMoney(indicator, "equity");
      const liabilities = indicatorMoney(indicator, "liabilities");
      return {
        periodLabel: year ? `Esercizio chiuso al ${date ?? year}` : `Esercizio ${date ?? "non indicato"}`,
        year,
        currency: "EUR",
        revenue,
        operatingProfit,
        ebitda,
        netIncome,
        totalAssets: balanceSheetTotal,
        equity,
        liabilitiesAndEquity:
          balanceSheetTotal ??
          (equity !== undefined && liabilities !== undefined ? equity + liabilities : undefined),
      };
    })
    .filter(
      (row) =>
        row.revenue !== undefined ||
        row.operatingProfit !== undefined ||
        row.ebitda !== undefined ||
        row.netIncome !== undefined ||
        row.totalAssets !== undefined ||
        row.equity !== undefined ||
        row.liabilitiesAndEquity !== undefined,
    )
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

  const documents = reports
    .map((report) => buildDownloadDocument(company, companyId, report))
    .filter(Boolean) as FinancialDocumentSummary[];

  if (years.length === 0 && documents.length === 0) return undefined;

  return {
    available: true,
    years,
    currency: "EUR",
    source: "OpenRegister / Bundesanzeiger (DE)",
    note: documents.length
      ? `Bilanci strutturati per ${company.name ?? "società tedesca"}, con download per esercizio tramite endpoint interno TPBox.`
      : `Financials strutturati per ${company.name ?? "società tedesca"}, provenienti da dati ufficiali pubblicati.`,
    documents: documents.length ? documents : undefined,
  };
}

export async function fetchOpenRegisterFinancials(
  query: string,
  apiKey: string | undefined,
  timeoutMs = 15000,
): Promise<OpenRegisterResult> {
  if (!apiKey) return { ok: false, skipped: "OPENREGISTER_API_KEY non configurata" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const company = await searchCompany(query, apiKey, ctrl.signal);
    if (!company?.company_id) return { ok: false, error: "OpenRegister: società tedesca non trovata" };

    const details = await fetchOpenRegisterFinancialsByCompanyId(company.company_id, apiKey, ctrl.signal);
    const financials = mapFinancials(company, company.company_id, details);
    if (!financials) return { ok: false, error: "OpenRegister: financials non disponibili per la società selezionata" };
    return { ok: true, data: financials };
  } catch (e) {
    const err = e as { name?: string; message?: string } | undefined;
    return { ok: false, error: `OpenRegister: ${err?.name === "AbortError" ? "timeout" : err?.message ?? "errore"}` };
  } finally {
    clearTimeout(timer);
  }
}
