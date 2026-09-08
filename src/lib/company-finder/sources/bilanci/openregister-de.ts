import type { Financials } from "../../types";

const API_BASE = "https://api.openregister.de";

type JsonObject = Record<string, unknown>;

interface OpenRegisterCompany {
  company_id?: string;
  name?: string;
  country?: string;
  register_number?: string;
  register_type?: string;
  register_court?: string;
  legal_form?: string;
  active?: boolean;
}

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
  if (typeof value === "string") {
    const normalized = value.replace(/\./g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
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
  const params = new URLSearchParams({ query, page: "1", per_page: "25" });
  const payload = asObject(await getJson(`${API_BASE}/v0/search/company?${params.toString()}`, apiKey, signal));
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const companies = results.map(asObject).filter(Boolean) as JsonObject[];
  let best: OpenRegisterCompany | undefined;
  let score = 0;
  for (const row of companies) {
    const candidate = row as OpenRegisterCompany;
    const s = similarity(candidate.name ?? "", query);
    if (s > score) {
      best = candidate;
      score = s;
    }
  }
  return best;
}

function findNumber(root: unknown, keys: RegExp): number | undefined {
  if (!root || typeof root !== "object") return undefined;
  for (const [key, value] of Object.entries(root as JsonObject)) {
    if (keys.test(key)) {
      const direct = numberValue(value);
      if (direct !== undefined) return direct;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = findNumber(value, keys);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function findString(root: unknown, keys: RegExp): string | undefined {
  if (!root || typeof root !== "object") return undefined;
  for (const [key, value] of Object.entries(root as JsonObject)) {
    if (keys.test(key)) {
      const direct = text(value);
      if (direct !== undefined) return direct;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = findString(value, keys);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function extractPeriods(payload: unknown): Array<{ periodLabel: string; currency?: string; data: JsonObject }> {
  const root = asObject(payload);
  const reports = Array.isArray(root?.reports) ? root.reports : [];
  return (reports.map(asObject).filter(Boolean) as JsonObject[]).map((report) => {
    const period =
      findString(report, /(reporting_date|report_date|period|fiscal_year|business_year)/i) ??
      "Esercizio non indicato";
    const currency = findString(report, /(currency|waehrung)/i);
    return { periodLabel: period, currency, data: report };
  });
}

function extractYear(periodLabel: string): number | undefined {
  const match = periodLabel.match(/(20\d{2})/);
  return match ? Number(match[1]) : undefined;
}

function mapFinancials(company: OpenRegisterCompany, payload: unknown): Financials | undefined {
  const periods = extractPeriods(payload);
  if (periods.length === 0) return undefined;

  const years = periods
    .map(({ periodLabel, currency, data }) => {
      const revenue = findNumber(data, /(revenue|sales|turnover|umsatz)/i);
      const operatingProfit = findNumber(data, /(operating_profit|operating_income|ebit|betriebsergebnis)/i);
      const netIncome = findNumber(data, /(net_income|net_profit|jahresüberschuss|jahresergebnis|profit_after_tax)/i);
      const totalAssets = findNumber(data, /(total_assets|balance_sheet_total|bilanzsumme)/i);
      const equity = findNumber(data, /(equity|shareholders_equity|eigenkapital)/i);
      const liabilitiesAndEquity = findNumber(data, /(liabilities_and_equity|passiva|balance_total)/i);
      return {
        periodLabel,
        year: extractYear(periodLabel),
        currency,
        revenue,
        operatingProfit,
        netIncome,
        totalAssets,
        equity,
        liabilitiesAndEquity,
      };
    })
    .filter((row) =>
      row.revenue !== undefined ||
      row.netIncome !== undefined ||
      row.totalAssets !== undefined ||
      row.equity !== undefined ||
      row.operatingProfit !== undefined ||
      row.liabilitiesAndEquity !== undefined,
    );

  if (years.length === 0) return undefined;

  return {
    available: true,
    years,
    source: "OpenRegister / Bundesanzeiger (DE)",
    note: `Financials strutturati per ${company.name ?? "società tedesca"}, provenienti da dati ufficiali pubblicati.`,
  };
}

export async function fetchOpenRegisterFinancials(
  query: string,
  apiKey: string | undefined,
  timeoutMs = 15000,
): Promise<OpenRegisterResult> {
  if (!apiKey) {
    return { ok: false, skipped: "OPENREGISTER_API_KEY non configurata" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const company = await searchCompany(query, apiKey, ctrl.signal);
    if (!company?.company_id) {
      return { ok: false, error: "OpenRegister: società tedesca non trovata" };
    }
    const details = await getJson(
      `${API_BASE}/v1/company/${encodeURIComponent(company.company_id)}/financials`,
      apiKey,
      ctrl.signal,
    );
    const financials = mapFinancials(company, details);
    if (!financials) {
      return { ok: false, error: "OpenRegister: financials non disponibili per la società selezionata" };
    }
    return { ok: true, data: financials };
  } catch (e) {
    const err = e as { name?: string; message?: string } | undefined;
    return {
      ok: false,
      error: `OpenRegister: ${err?.name === "AbortError" ? "timeout" : err?.message ?? "errore"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
