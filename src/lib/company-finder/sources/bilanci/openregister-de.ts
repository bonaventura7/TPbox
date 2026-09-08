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

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function similarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.startsWith(y) || y.startsWith(x)) return 0.9;
  if (x.includes(y) || y.includes(x)) return 0.75;
  return 0;
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

async function searchCompany(
  query: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<OpenRegisterCompany | undefined> {
  const params = new URLSearchParams({ query });
  const payload = asObject(await getJson(`${API_BASE}/v1/autocomplete/company?${params.toString()}`, apiKey, signal));
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const companies = results.map(asObject).filter(Boolean) as JsonObject[];

  let best: OpenRegisterCompany | undefined;
  let bestScore = -1;
  for (const row of companies) {
    const candidate = row as OpenRegisterCompany;
    if (candidate.country && candidate.country.toUpperCase() !== "DE") continue;
    const score = similarity(candidate.name ?? "", query);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function indicatorYear(dateValue: unknown): number | undefined {
  const date = text(dateValue);
  if (!date) return undefined;
  const match = date.match(/(20\d{2})/);
  return match ? Number(match[1]) : undefined;
}

function indicatorNumber(indicator: Indicator, key: string): number | undefined {
  return numberValue(indicator[key]);
}

function reportEndYear(report: JsonObject): number | undefined {
  return indicatorYear(report.report_end_date ?? report.report_date ?? report.date);
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
    ["Data inizio", csvCell(report.report_start_date)].join(";"),
    ["Data fine", csvCell(report.report_end_date)].join(";"),
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
    flattenRows(table.rows, [], lines, label);
    if (lines.length > before) lines.splice(before, 0, [csvCell(label), "", "", ""].join(";"));
  }

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function buildDownloadDocument(
  company: OpenRegisterCompany,
  companyId: string,
  report: JsonObject,
): FinancialDocumentSummary | undefined {
  const reportId = text(report.report_id);
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
  return (Array.isArray(root?.reports) ? root.reports : [])
    .map(asObject)
    .filter(Boolean) as JsonObject[];
}

function mapFinancials(
  company: OpenRegisterCompany,
  companyId: string,
  payload: unknown,
): Financials | undefined {
  const root = asObject(payload);
  const indicators = Array.isArray(root?.indicators)
    ? (root.indicators.map(asObject).filter(Boolean) as Indicator[])
    : [];
  const reports = reportList(payload);

  if (indicators.length === 0 && reports.length === 0) return undefined;

  const years = indicators
    .map((indicator) => {
      const date = text(indicator.date);
      const year = indicatorYear(date);
      const balanceSheetTotal = indicatorNumber(indicator, "balance_sheet_total");
      const revenue = indicatorNumber(indicator, "revenue");
      const operatingProfit = indicatorNumber(indicator, "ebit");
      const ebitda = indicatorNumber(indicator, "ebitda");
      const netIncome = indicatorNumber(indicator, "net_income");
      const equity = indicatorNumber(indicator, "equity");
      const liabilities = indicatorNumber(indicator, "liabilities");
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
