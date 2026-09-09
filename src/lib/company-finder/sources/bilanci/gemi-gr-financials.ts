import type { FinancialYear } from "../../types";

export interface GreekFinancialParseResult {
  matched: boolean;
  confidence: "high" | "medium" | "low";
  years: FinancialYear[];
}

type FinancialField = keyof Pick<
  FinancialYear,
  "revenue" | "operatingProfit" | "ebitda" | "netIncome" | "totalAssets" | "equity"
>;

const LABELS: Array<{ field: FinancialField; patterns: RegExp[] }> = [
  {
    field: "revenue",
    patterns: [/κύκλος\s+εργασιών/i, /πωλήσεις/i, /έσοδα/i, /turnover/i, /revenue/i, /sales/i],
  },
  {
    field: "operatingProfit",
    patterns: [/λειτουργικά\s+κέρδη/i, /κέρδη\s+εκμετάλλευσης/i, /operating\s+profit/i, /operating\s+income/i, /ebit(?!da)/i],
  },
  { field: "ebitda", patterns: [/\bebitda\b/i] },
  {
    field: "netIncome",
    patterns: [
      /καθαρά\s+κέρδη/i,
      /καθαρά\s+αποτελέσματα/i,
      /κέρδη\s+μετά\s+φόρων/i,
      /net\s+income/i,
      /profit\s+after\s+tax/i,
    ],
  },
  {
    field: "totalAssets",
    patterns: [/σύνολο\s+ενεργητικού/i, /σύνολο\s+περιουσιακών/i, /total\s+assets/i],
  },
  {
    field: "equity",
    patterns: [/ίδια\s+κεφάλαια/i, /καθαρή\s+θέση/i, /σύνολο\s+ιδίων/i, /equity/i],
  },
];

const NUMBER = /(?:\(\s*)?[-−+]?\s*\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?\s*\)?|(?:\(\s*)?[-−+]?\s*\d+(?:,\d+)?\s*\)?/g;

function parseGreekNumber(raw: string): number | undefined {
  const value = raw.trim();
  if (!/\d/.test(value)) return undefined;

  const negative = /^\s*\(/.test(value) || /^\s*[-−]/.test(value);
  const unsigned = value
    .replace(/[()]/g, "")
    .replace(/\s+/g, "")
    .replace(/[−+]/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const parsed = Number(unsigned);
  if (!Number.isFinite(parsed)) return undefined;
  return negative ? -parsed : parsed;
}

function extractNumbers(line: string): number[] {
  return [...line.matchAll(NUMBER)]
    .map((match) => parseGreekNumber(match[0]))
    .filter((value): value is number => value !== undefined);
}

function extractYears(text: string): number[] {
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  return [...new Set(years)].filter((year) => year >= 2000 && year <= 2100).slice(0, 6);
}

function findField(line: string): FinancialField | undefined {
  for (const entry of LABELS) {
    if (entry.patterns.some((pattern) => pattern.test(line))) return entry.field;
  }
  return undefined;
}

function emptyResult(): GreekFinancialParseResult {
  return { matched: false, confidence: "low", years: [] };
}

export function parseGreekFinancialDocument(input: {
  text: string;
  sourceUrl?: string;
}): GreekFinancialParseResult {
  const text = input.text.replace(/\u00a0/g, " ").replace(/\r/g, "");
  const years = extractYears(text);
  if (!years.length) return emptyResult();

  const parsed: FinancialYear[] = years.map((year) => ({
    periodLabel: String(year),
    year,
    currency: "EUR",
  }));

  let matchedFields = 0;
  for (const line of text.split("\n")) {
    const field = findField(line);
    if (!field) continue;

    const values = extractNumbers(line).filter((value) => !years.includes(value));
    if (!values.length || values.length < years.length) continue;

    const usable = values.slice(0, years.length);
    usable.forEach((value, index) => {
      parsed[index][field] = value;
    });
    matchedFields += 1;
  }

  if (!matchedFields) return emptyResult();

  return {
    matched: true,
    confidence: matchedFields >= 3 ? "high" : matchedFields >= 2 ? "medium" : "low",
    years: parsed,
  };
}
