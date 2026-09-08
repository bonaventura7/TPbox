import type { Financials } from "../../types";

const API_BASE = "https://api.openregister.de";

type JsonObject = Record<string, unknown>;

type OpenRegisterCompany = { company_id?: string; name?: string; country?: string };
type Indicator = JsonObject & { date?: string };

export interface OpenRegisterResult { ok: boolean; data?: Financials; error?: string; skipped?: string }

function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : undefined;
}
function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s/g, "");
  if (!normalized) return undefined;
  const european = /^-?[\d.]+,\d+$/.test(normalized);
  const cleaned = european ? normalized.replace(/\./g, "").replace(",", ".") : normalized.replace(/,/g, "");
  const parsed = Number(cleaned.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}
function normalizeName(value: string): string { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase(); }
function similarity(a: string, b: string): number {
  const x = normalizeName(a), y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.startsWith(y) || y.startsWith(x)) return 0.9;
  if (x.includes(y) || y.includes(x)) return 0.75;
  return 0;
}
async function getJson(url: string, apiKey: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}`, "User-Agent": "TPbox-Company-Finder/1.0" }, signal, cache: "no-store" });
  if (!response.ok) throw new Error(`OpenRegister HTTP ${response.status}`);
  return response.json();
}
async function searchCompany(query: string, apiKey: string, signal: AbortSignal): Promise<OpenRegisterCompany | undefined> {
  const payload = asObject(await getJson(`${API_BASE}/v1/autocomplete/company?${new URLSearchParams({ query })}`, apiKey, signal));
  const results = Array.isArray(payload?.results) ? payload.results : [];
  let best: OpenRegisterCompany | undefined;
  let bestScore = -1;
  for (const row of results.map(asObject).filter(Boolean) as JsonObject[]) {
    const candidate = row as OpenRegisterCompany;
    if (candidate.country && candidate.country.toUpperCase() !== "DE") continue;
    const score = similarity(candidate.name ?? "", query);
    if (score > bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}
function indicatorYear(dateValue: unknown): number | undefined { const date = text(dateValue); const match = date?.match(/(20\d{2})/); return match ? Number(match[1]) : undefined; }
function indicatorNumber(indicator: Indicator, key: string): number | undefined { return numberValue(indicator[key]); }
function mapFinancials(company: OpenRegisterCompany, payload: unknown): Financials | undefined {
  const root = asObject(payload);
  const indicators = Array.isArray(root?.indicators) ? (root.indicators.map(asObject).filter(Boolean) as Indicator[]) : [];
  if (!indicators.length) return undefined;
  const years = indicators.map((indicator) => {
    const date = text(indicator.date); const year = indicatorYear(date);
    const balanceSheetTotal = indicatorNumber(indicator, "balance_sheet_total");
    const equity = indicatorNumber(indicator, "equity"); const liabilities = indicatorNumber(indicator, "liabilities");
    return {
      periodLabel: year ? `Esercizio chiuso al ${date ?? year}` : `Esercizio ${date ?? "non indicato"}`,
      year, currency: "EUR",
      revenue: indicatorNumber(indicator, "revenue"), operatingProfit: indicatorNumber(indicator, "ebit"),
      ebitda: indicatorNumber(indicator, "ebitda"), netIncome: indicatorNumber(indicator, "net_income"),
      totalAssets: balanceSheetTotal, equity,
      liabilitiesAndEquity: balanceSheetTotal ?? (equity !== undefined && liabilities !== undefined ? equity + liabilities : undefined),
    };
  }).filter((row) => row.revenue !== undefined || row.operatingProfit !== undefined || row.ebitda !== undefined || row.netIncome !== undefined || row.totalAssets !== undefined || row.equity !== undefined || row.liabilitiesAndEquity !== undefined).sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  if (!years.length) return undefined;
  return { available: true, years, currency: "EUR", source: "OpenRegister / Bundesanzeiger (DE)", note: `Financials strutturati per ${company.name ?? "società tedesca"}, provenienti da dati ufficiali pubblicati.` };
}
export async function fetchOpenRegisterFinancials(query: string, apiKey: string | undefined, timeoutMs = 15000): Promise<OpenRegisterResult> {
  if (!apiKey?.trim()) return { ok: false, skipped: "OPENREGISTER_API_KEY non configurata" };
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const company = await searchCompany(query, apiKey.trim(), ctrl.signal);
    if (!company?.company_id) return { ok: false, error: "OpenRegister: società tedesca non trovata" };
    const details = await getJson(`${API_BASE}/v1/company/${encodeURIComponent(company.company_id)}/financials`, apiKey.trim(), ctrl.signal);
    const financials = mapFinancials(company, details);
    if (!financials) return { ok: false, error: "OpenRegister: financials non disponibili per la società selezionata" };
    return { ok: true, data: financials };
  } catch (e) {
    const err = e as { name?: string; message?: string } | undefined;
    return { ok: false, error: `OpenRegister: ${err?.name === "AbortError" ? "timeout" : err?.message ?? "errore"}` };
  } finally { clearTimeout(timer); }
}
