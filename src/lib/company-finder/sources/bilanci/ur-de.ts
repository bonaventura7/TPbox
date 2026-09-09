import type { Financials } from "../../types";
import { fetchOpenRegisterFinancials } from "./openregister-de";
import { fetchGermanyPublicBalance } from "./germany-public-balance";

const FIRMENDATA_API = "https://api.firmendata.com";
const LEGAL_FORM_TOKENS = new Set([
  "ag",
  "aktiengesellschaft",
  "gmbh",
  "mbh",
  "kg",
  "ohg",
  "eg",
  "egr",
  "ek",
  "ev",
  "ug",
  "haftungsbeschrankt",
  "se",
  "kgaa",
  "gesellschaft",
  "haftung",
  "beschrankter",
  "beschrankte",
  "allgemeine",
  "kommanditgesellschaft",
  "offene",
  "handelsgesellschaft",
]);

type JsonObject = Record<string, unknown>;

export interface UrResult {
  ok: boolean;
  data?: Financials;
  error?: string;
  skipped?: string;
}

function env(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function coreTokens(value: string): string[] {
  return normalizeName(value)
    .split(" ")
    .filter((token) => token && !LEGAL_FORM_TOKENS.has(token));
}

function similarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  const xCore = coreTokens(a);
  const yCore = coreTokens(b);
  if (!xCore.length || !yCore.length) return 0;
  if (xCore.join(" ") === yCore.join(" ")) return 0.98;

  const shorter = xCore.length <= yCore.length ? xCore : yCore;
  const longer = xCore.length > yCore.length ? xCore : yCore;
  const overlap = shorter.filter((token) => longer.includes(token)).length;
  if (overlap === shorter.length && overlap > 0) return shorter.length === 1 ? 0.94 : 0.9;

  const first = shorter[0];
  if (first && longer[0] === first) return 0.82;
  return 0;
}

async function resolveGermanyCompanyName(
  query: string,
  timeoutMs: number,
): Promise<{ name: string; euId?: string } | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 7000));
  try {
    const url = new URL(`${FIRMENDATA_API}/v1/companies/autocomplete`);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "8");
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "TPbox-Company-Finder/1.0",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return undefined;
    const payload = asObject(await response.json());
    const rows = Array.isArray(payload?.["data"])
      ? (payload["data"] as unknown[]).map(asObject).filter(Boolean) as JsonObject[]
      : [];
    let best: { name: string; euId?: string; score: number } | undefined;
    for (const row of rows) {
      const name = text(row["legal_name"]) ?? text(row["display_name"]);
      if (!name) continue;
      const score = similarity(name, query);
      if (!best || score > best.score) {
        const euId = text(row["eu_id"]);
        best = { name, ...(euId === undefined ? {} : { euId }), score };
      }
    }
    return best && best.score >= 0.8 ? { name: best.name, ...(best.euId === undefined ? {} : { euId: best.euId }) } : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Germany financials provider chain.
 * 1. OpenRegister: official-source structured balance sheet / P&L when configured.
 * 2. FirmenData keyless autocomplete: resolve the legal German company name.
 * 3. Public indexed balance resolver: server-side extraction of public balance data.
 *
 * No CAPTCHA/WAF is bypassed and no provider detail is exposed to the client.
 */
export async function searchUrAccounting(companyName: string, timeoutMs = 30000): Promise<UrResult> {
  const query = companyName.trim();
  if (query.length < 3) return { ok: false, error: "ragione sociale troppo corta" };

  const key = env()["OPENREGISTER_API_KEY"]?.trim();
  if (key) {
    const structured = await fetchOpenRegisterFinancials(query, key, Math.min(timeoutMs, 15000));
    if (structured.ok && structured.data) return structured;
  }

  const resolved = await resolveGermanyCompanyName(query, timeoutMs);
  const candidates = [...new Set([resolved?.name, query].filter(Boolean) as string[])];

  for (const candidate of candidates) {
    const publicBalance = await fetchGermanyPublicBalance(candidate);
    if (publicBalance.ok && publicBalance.data) return publicBalance;
  }

  return {
    ok: false,
    error: [
      key ? "OpenRegister non ha restituito il bilancio" : "nessun bilancio strutturato configurato",
      resolved ? "resolver societario senza bilancio pubblico disponibile" : "società tedesca non risolta",
    ].join("; "),
  };
}
