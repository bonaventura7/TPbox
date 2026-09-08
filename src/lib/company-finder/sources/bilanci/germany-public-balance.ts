import type { FinancialDocumentSummary, Financials } from "../../types";

type JsonObject = Record<string, unknown>;

const SEARCH_BASES = [
  {
    name: "duckduckgo",
    buildUrl: (query: string) =>
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:unternehmen24.info/Firmeninformationen/Deutschland/Firma/ "${query}"`)}`,
  },
  {
    name: "google",
    buildUrl: (query: string) =>
      `https://www.google.com/search?hl=de&num=10&q=${encodeURIComponent(`site:unternehmen24.info/Firmeninformationen/Deutschland/Firma/ "${query}"`)}`,
  },
  {
    name: "bing",
    buildUrl: (query: string) =>
      `https://www.bing.com/search?q=${encodeURIComponent(`site:unternehmen24.info/Firmeninformationen/Deutschland/Firma/ "${query}"`)}`,
  },
] as const;
const COMPANY_PAGE_PREFIX = "https://www.unternehmen24.info/Firmeninformationen/Deutschland/Firma/";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const TIMEOUT_MS = 12_000;

export interface PublicGermanyBalanceResult {
  ok: boolean;
  data?: Financials;
  error?: string;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function numberValue(value: string): number | undefined {
  const normalized = value
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstMatch(text: string, regex: RegExp): number | undefined {
  const match = regex.exec(text);
  return match ? numberValue(match[1]!) : undefined;
}

function fiscalYear(pageText: string): number | undefined {
  const patterns = [
    /Jahresabschluss\s+(?:zum\s+)?Geschäftsjahr\s+vom\s+01\.01\.(20\d{2})\s+bis\s+zum\s+31\.12\.\d{4}/i,
    /Jahresabschluss\s+(20\d{2})/i,
    /Geschäftsjahr\s+vom\s+01\.01\.(20\d{2})\s+bis\s+zum\s+31\.12\./i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(pageText);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function decodeRedirectHref(href: string): string | undefined {
  const direct = decodeHtml(href);
  if (direct.startsWith(COMPANY_PAGE_PREFIX)) return direct;
  const patterns = [/[?&]uddg=([^&]+)/i, /[?&]q=(https%3A%2F%2F[^&]+)/i, /\/(?:url|link)\?[^\s"']*?[?&]q=([^&]+)/i];
  for (const pattern of patterns) {
    const match = direct.match(pattern)?.[1];
    if (!match) continue;
    try {
      const candidate = decodeURIComponent(match);
      if (candidate.startsWith(COMPANY_PAGE_PREFIX)) return candidate;
    } catch {
      // Ignore malformed redirects and continue with the next result.
    }
  }
  return undefined;
}

function searchResultUrl(html: string, companyName: string): string | undefined {
  const normalizedQuery = stripHtml(companyName).toLowerCase().replace(/[^a-z0-9äöüß]/gi, "");
  const candidates: Array<{ url: string; label: string }> = [];

  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeRedirectHref(match[1]!);
    const label = stripHtml(match[2]!);
    if (!href) continue;
    candidates.push({ url: href, label });
  }

  if (!candidates.length) return undefined;
  candidates.sort((a, b) => {
    const aName = a.label.toLowerCase().replace(/[^a-z0-9äöüß]/gi, "");
    const bName = b.label.toLowerCase().replace(/[^a-z0-9äöüß]/gi, "");
    const aScore = aName === normalizedQuery ? 3 : aName.includes(normalizedQuery) || normalizedQuery.includes(aName) ? 2 : 0;
    const bScore = bName === normalizedQuery ? 3 : bName.includes(normalizedQuery) || normalizedQuery.includes(bName) ? 2 : 0;
    return bScore - aScore;
  });
  return candidates[0]?.url;
}

async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.7",
      "User-Agent": UA,
    },
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function findPublicBalancePage(
  companyName: string,
  signal: AbortSignal,
): Promise<{ sourceUrl: string; pageText: string; year: number } | undefined> {
  const query = companyName.trim();
  for (const search of SEARCH_BASES) {
    try {
      const searchHtml = await fetchText(search.buildUrl(query), signal);
      const sourceUrl = searchResultUrl(searchHtml, query);
      if (!sourceUrl) continue;
      const pageText = stripHtml(await fetchText(sourceUrl, signal));
      const year = fiscalYear(pageText);
      if (year) return { sourceUrl, pageText, year };
    } catch {
      // A single search engine must not take down the Germany resolver.
    }
  }
  return undefined;
}

function buildCsv(companyName: string, year: number, pageText: string): string | undefined {
  const rows: Array<[string, string, number | undefined]> = [];
  const add = (section: string, label: string, regex: RegExp) =>
    rows.push([section, label, firstMatch(pageText, regex)]);

  add("Aktiva", "Anlagevermögen", /Anlagevermögen\s+([\d.\s]+\s*€)/i);
  add("Aktiva", "Sachanlagen", /Sachanlagen\s+([\d.\s]+\s*€)/i);
  add("Aktiva", "Umlaufvermögen", /Umlaufvermögen\s+([\d.\s]+\s*€)/i);
  add("Aktiva", "Forderungen und sonstige Vermögensgegenstände", /Forderungen und sonstige Vermögensgegenstände\s+([\d.\s]+\s*€)/i);
  add("Aktiva", "Kassenbestand, Guthaben bei Kreditinstituten und Schecks", /Kassenbestand, Guthaben bei Kreditinstituten und Schecks\s+([\d.\s]+\s*€)/i);
  add("Aktiva", "Summe Aktiva", /Summe Aktiva\s+([\d.\s]+\s*€)/i);
  add("Passiva", "Eigenkapital", /Eigenkapital\s+([\d.\s]+\s*€)/i);
  add("Passiva", "Gezeichnetes Kapital", /Gezeichnetes Kapital\s+([\d.\s]+\s*€)/i);
  add("Passiva", "Bilanzgewinn", /Bilanzgewinn\s+([\d.\s]+\s*€)/i);
  add("Passiva", "Gewinnvortrag", /Gewinnvortrag\s+([\d.\s]+\s*€)/i);
  add("Passiva", "Jahresüberschuss", /Jahresüberschuss\s+([\d.\s]+\s*€)/i);
  add("Passiva", "Rückstellungen", /Rückstellungen\s+([\d.\s]+\s*€)/i);
  add("Passiva", "Verbindlichkeiten", /Verbindlichkeiten\s+([\d.\s]+\s*€)/i);
  add("Passiva", "Summe Passiva", /Summe Passiva\s+([\d.\s]+\s*€)/i);
  add("GuV", "Gewinn / Jahresüberschuss", /Gewinn\s+([\d.\s]+\s*€)/i);

  const useful = rows.filter(([, , value]) => value !== undefined);
  if (!useful.length) return undefined;

  const lines = [
    `\uFEFFGesellschaft;${companyName.replace(/;/g, ",")}`,
    `Esercizio;${year}`,
    "",
    "Sektion;Position;Wert EUR",
    ...useful.map(([section, label, value]) => `${section};${label};${value ?? ""}`),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

function document(companyName: string, year: number): FinancialDocumentSummary {
  const params = new URLSearchParams({ company: companyName, year: String(year) });
  return {
    id: `germany-public-balance-${year}`,
    year,
    kind: "BALANCE_SHEET",
    format: "csv",
    availability: "DOCUMENT_DOWNLOADABLE",
    title: `${companyName} - Bilancio ${year}`,
    downloadUrl: `/api/company-finder/germany-public-balance?${params.toString()}`,
  };
}

export async function fetchGermanyPublicBalance(companyName: string): Promise<PublicGermanyBalanceResult> {
  const query = companyName.trim();
  if (query.length < 3) return { ok: false, error: "ragione sociale troppo corta" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS * SEARCH_BASES.length);
  try {
    const found = await findPublicBalancePage(query, controller.signal);
    if (!found) return { ok: false, error: "nessuna pagina pubblica di bilancio trovata" };

    const totalAssets = firstMatch(found.pageText, /Summe Aktiva\s+([\d.\s]+\s*€)/i);
    const equity = firstMatch(found.pageText, /Eigenkapital\s+([\d.\s]+\s*€)/i);
    const liabilitiesAndEquity = firstMatch(found.pageText, /Summe Passiva\s+([\d.\s]+\s*€)/i);
    const netIncome = firstMatch(found.pageText, /Jahresüberschuss\s+([\d.\s]+\s*€)/i);

    return {
      ok: true,
      data: {
        available: true,
        years: [{
          periodLabel: `Esercizio ${found.year}`,
          year: found.year,
          currency: "EUR",
          netIncome,
          totalAssets,
          equity,
          liabilitiesAndEquity,
        }],
        currency: "EUR",
        note: "Bilancio disponibile per il download tramite TPBox.",
        documents: [document(query, found.year)],
      },
    };
  } catch (error) {
    const err = error as { name?: string; message?: string };
    return { ok: false, error: err?.name === "AbortError" ? "timeout" : err?.message ?? "errore" };
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadGermanyPublicBalanceCsv(
  companyName: string,
  requestedYear?: number,
): Promise<{ csv: string; year: number } | undefined> {
  const query = companyName.trim();
  if (query.length < 3) return undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS * SEARCH_BASES.length);
  try {
    const found = await findPublicBalancePage(query, controller.signal);
    if (!found || (requestedYear !== undefined && found.year !== requestedYear)) return undefined;
    const csv = buildCsv(query, found.year, found.pageText);
    return csv ? { csv, year: found.year } : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function buildGermanyPublicBalanceCsv(
  sourceUrl: string,
  companyName: string,
): Promise<{ csv: string; year: number } | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const source = new URL(sourceUrl);
    if (source.protocol !== "https:" || !["www.unternehmen24.info", "unternehmen24.info"].includes(source.hostname.toLowerCase())) return undefined;
    const pageText = stripHtml(await fetchText(source.toString(), controller.signal));
    const year = fiscalYear(pageText);
    if (!year) return undefined;
    const csv = buildCsv(companyName, year, pageText);
    return csv ? { csv, year } : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
