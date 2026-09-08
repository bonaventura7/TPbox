import type { FinancialDocumentSummary, Financials } from "../../types";

type JsonObject = Record<string, unknown>;

const SEARCH_BASE = "https://html.duckduckgo.com/html/";
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

function searchResultUrl(html: string, companyName: string): string | undefined {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => decodeHtml(m[1]!));
  const candidates = hrefs
    .map((href) => {
      if (href.startsWith(COMPANY_PAGE_PREFIX)) return href;
      const target = href.match(/[?&]uddg=([^&]+)/i)?.[1];
      return target ? decodeURIComponent(target) : undefined;
    })
    .filter((url): url is string => Boolean(url) && url.startsWith(COMPANY_PAGE_PREFIX));

  const normalized = companyName.toLowerCase().replace(/[^a-z0-9äöüß]/gi, "");
  return (
    candidates.find((url) =>
      url.toLowerCase().replace(/[^a-z0-9äöüß]/gi, "").includes(normalized),
    ) ?? candidates[0]
  );
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

function buildCsv(
  companyName: string,
  sourceUrl: string,
  pageText: string,
): { csv: string; year?: number } | undefined {
  const year = fiscalYear(pageText);
  if (!year) return undefined;

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
    `Fonte;${sourceUrl.replace(/;/g, ",")}`,
    `Esercizio;${year}`,
    "",
    "Sektion;Position;Wert EUR",
    ...useful.map(([section, label, value]) => `${section};${label};${value ?? ""}`),
  ];
  return { csv: `${lines.join("\r\n")}\r\n`, year };
}

function document(companyName: string, sourceUrl: string, year: number): FinancialDocumentSummary {
  const params = new URLSearchParams({ company: companyName, sourceUrl, year: String(year) });
  return {
    id: `unternehmen24-${year}`,
    year,
    kind: "ANNUAL_REPORT",
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
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const searchHtml = await fetchText(
      `${SEARCH_BASE}?q=${encodeURIComponent(`site:unternehmen24.info/Firmeninformationen/Deutschland/Firma/ "${query}"`)}`,
      controller.signal,
    );
    const sourceUrl = searchResultUrl(searchHtml, query);
    if (!sourceUrl) return { ok: false, error: "nessuna pagina pubblica di bilancio trovata" };

    const pageHtml = await fetchText(sourceUrl, controller.signal);
    const pageText = stripHtml(pageHtml);
    const built = buildCsv(query, sourceUrl, pageText);
    if (!built) return { ok: false, error: "pagina trovata ma dati di bilancio non esposti" };

    const totalAssets = firstMatch(pageText, /Summe Aktiva\s+([\d.\s]+\s*€)/i);
    const equity = firstMatch(pageText, /Eigenkapital\s+([\d.\s]+\s*€)/i);
    const liabilitiesAndEquity = firstMatch(pageText, /Summe Passiva\s+([\d.\s]+\s*€)/i);
    const netIncome = firstMatch(pageText, /Jahresüberschuss\s+([\d.\s]+\s*€)/i);

    return {
      ok: true,
      data: {
        available: true,
        years: [{
          periodLabel: `Esercizio ${built.year}`,
          year: built.year,
          currency: "EUR",
          netIncome,
          totalAssets,
          equity,
          liabilitiesAndEquity,
        }],
        currency: "EUR",
        source: "Öffentliche Bilanzdaten — Unternehmen24 (DE)",
        note: "Dati finanziari estratti da una pagina pubblicamente accessibile che riporta il bilancio depositato. Il file scaricabile è un export dei dati pubblici, non il PDF originale.",
        documents: [document(query, sourceUrl, built.year!)],
      },
    };
  } catch (error) {
    const err = error as { name?: string; message?: string };
    return { ok: false, error: err?.name === "AbortError" ? "timeout" : err?.message ?? "errore" };
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
    const pageHtml = await fetchText(source.toString(), controller.signal);
    const pageText = stripHtml(pageHtml);
    return buildCsv(companyName, source.toString(), pageText) as { csv: string; year: number } | undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
