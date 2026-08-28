// ---------- Companies House — Regno Unito ----------
// API ufficiale HM Government (variabile COMPANIES_HOUSE_API_KEY, gratuita).
//
// Due modalità:
//  - CON chiave: search + scheda completa + CONTI ANNUALI (profit & loss /
//    balance sheet) → è la fonte "bilancio" reale per il UK.
//  - SENZA chiave: l'endpoint di ricerca /search/companies è accessibile
//    senza chiave → restituisce la scheda (nome, numero, stato, tipo,
//    indirizzo, data di costituzione). I conti annuali richiedono la chiave.
//
// Il dominio api.companyhouse.gov.uk può essere irraggiungibile da alcune
// reti (es. sandbox): in quel caso si riprova sul dominio storico
// find-and-update.company-information.service.gov.uk (stessi path).

import type { CompanyProfile, FinancialYear } from "../types";
import { getCountry } from "../countries";

const BASES = [
  "https://api.companyhouse.gov.uk",
  "https://find-and-update.company-information.service.gov.uk",
];

export interface ChCompany {
  number: string;
  profile: CompanyProfile;
}

export interface ChResult {
  ok: boolean;
  company?: ChCompany | undefined;
  financialYears?: FinancialYear[] | undefined;
  accountsNote?: string | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

function headers(apiKey?: string): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (apiKey) h["CH-Api-Key"] = apiKey;
  return h;
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/** Prova l'endpoint su entrambi i domini; usa il primo che risponde. */
async function fetchAny(
  path: string,
  apiKey: string | undefined,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response> {
  let lastErr: unknown = null;
  for (const base of BASES) {
    try {
      return await fetchWithTimeout(
        `${base}${path}`,
        { headers: headers(apiKey), ...init },
        timeoutMs,
      );
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("Companies House: rete non raggiungibile");
}

interface SearchItem {
  company_number?: string | undefined;
  title?: string | undefined;
  company_status?: string | undefined;
  company_type?: string | undefined;
  date_of_creation?: string | undefined;
  address_snippet?: string | undefined;
  address?: Record<string, unknown> | undefined;
  matches?: Record<string, unknown> | undefined;
}

async function searchItems(name: string, apiKey: string | undefined): Promise<SearchItem[]> {
  const res = await fetchAny(
    `/search/companies?q=${encodeURIComponent(name)}&items_per_page=10`,
    apiKey,
    15000,
  );
  if (!res.ok) throw new Error(`Companies House search HTTP ${res.status}`);
  const json = (await res.json()) as { items?: SearchItem[] } | undefined;
  const items = json?.items;
  return Array.isArray(items) ? items : [];
}

function bestMatch(items: SearchItem[], name?: string, number?: string): SearchItem | undefined {
  if (number) {
    const exact = items.find((i) => i.company_number === number);
    if (exact) return exact;
  }
  const active = items.filter((i) => i.company_status === "active");
  const pool = active.length > 0 ? active : items;
  if (pool.length === 0) return undefined;
  const norm = name?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  return [...pool].sort((a, b) => {
    const sa = Number((a.matches as Record<string, unknown>)?.["score"] ?? 0);
    const sb = Number((b.matches as Record<string, unknown>)?.["score"] ?? 0);
    if (sa !== sb) return sb - sa;
    if (norm) {
      const ta = (a.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const tb = (b.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const pa = ta.startsWith(norm) ? 0 : 1;
      const pb = tb.startsWith(norm) ? 0 : 1;
      if (pa !== pb) return pa - pb;
    }
    return 0;
  })[0];
}

function addressFromItem(it: SearchItem): string | undefined {
  if (it.address) {
    const a = it.address;
    const line = [
      a["address_line_1"],
      a["address_line_2"],
      a["locality"],
      a["region"],
      a["postal_code"],
    ]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase())
      .join(", ");
    if (line) return line;
  }
  return it.address_snippet ? String(it.address_snippet).toLowerCase() : undefined;
}

function profileFromSearchItem(it: SearchItem): CompanyProfile {
  const country = getCountry("UK")!;
  return {
    name: it.title ?? it.company_number ?? "—",
    nameSource: "Companies House",
    country,
    registry: {
      name: "Companies House",
      authority: "HM Government",
      id: `Company No. ${it.company_number ?? ""}`,
    },
    legalForm: it.company_type ? String(it.company_type).toLowerCase() : undefined,
    status: it.company_status ? String(it.company_status).toLowerCase() : undefined,
    registeredSince: it.date_of_creation ? String(it.date_of_creation) : undefined,
    address: addressFromItem(it),
  };
}

async function fetchCompany(number: string, apiKey: string): Promise<Record<string, unknown>> {
  const res = await fetchAny(`/companies/${number}`, apiKey, 15000);
  if (!res.ok) throw new Error(`Companies House company HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function fetchAccounts(
  number: string,
  apiKey: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetchAny(`/companies/${number}/accounts`, apiKey, 15000);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Companies House accounts HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

function pickNumber(input: unknown, type: string): number | undefined {
  if (!input) return undefined;
  const items = Array.isArray(input) ? input : [input];
  for (const it of items as Array<Record<string, unknown>>) {
    if (it && it["type"] === type) {
      const v = Number(it["accountsAmount"] ?? it["value"] ?? it["amount"]);
      if (!Number.isNaN(v)) return v;
    }
  }
  return undefined;
}

export async function lookupCompany(
  name: string,
  apiKey: string | undefined,
  opts?: { preferredNumber?: string },
): Promise<ChResult> {
  try {
    // ---------- MODALITÀ CON CHIAVE: scheda + conti annuali ----------
    if (apiKey) {
      let number = opts?.preferredNumber;
      let c: Record<string, unknown> | undefined;
      let item: SearchItem | undefined;
      if (number) {
        try {
          c = await fetchCompany(number, apiKey);
        } catch {
          c = undefined;
        }
      }
      if (!c) {
        item = bestMatch(await searchItems(name, apiKey), name, number);
        if (!item) return { ok: false, error: "Companies House: nessuna società corrispondente" };
        number = String(item.company_number);
        try {
          c = await fetchCompany(String(number), apiKey);
        } catch {
          c = undefined; // fallback: profilo dai dati della ricerca
        }
      }

      const roa = (c?.["registered_office_address"] ?? {}) as Record<string, unknown>;
      const country = getCountry("UK")!;
      const profile: CompanyProfile =
        c && c["company_name"]
          ? {
              name: String(c["company_name"]),
              nameSource: "Companies House",
              country,
              registry: {
                name: "Companies House",
                authority: "HM Government",
                id: `Company No. ${number}`,
              },
              legalForm: c["type"] ? String(c["type"]).toLowerCase() : undefined,
              status: c["company_status"] ? String(c["company_status"]).toLowerCase() : undefined,
              registeredSince: c["date_of_creation"] ? String(c["date_of_creation"]) : undefined,
              address:
                [
                  roa["address_line_1"],
                  roa["premises"],
                  roa["locality"],
                  roa["region"],
                  roa["postal_code"],
                ]
                  .filter(Boolean)
                  .map((s) => String(s).toLowerCase())
                  .join(", ") || undefined,
              activityCodes: Array.isArray(c["sic_codes"])
                ? (c["sic_codes"] as string[]).slice(0, 8).map((code) => ({ code }))
                : [],
            }
          : profileFromSearchItem(item!);

      let financialYears: FinancialYear[] = [];
      let accountsNote: string | undefined;
      try {
        const acc = await fetchAccounts(String(number), apiKey);
        const arr = (acc?.["accounts"] as Record<string, unknown>[]) || [];
        const a = arr[0];
        if (a) {
          const currency = String(a["accountsCurrency"] || "GBP");
          const ref = a["accountsReferenceDate"]
            ? `al ${String(a["accountsReferenceDate"])}`
            : undefined;
          financialYears = [
            {
              periodLabel: ref
                ? `${String(a["accountsType"] || "annual accounts")} ${ref}`
                : "ultimo esercizio depositato",
              revenue: pickNumber(a["profitAndLoss"], "TURNOVER"),
              operatingProfit: pickNumber(a["profitAndLoss"], "OPERATING_PROFIT"),
              netIncome: pickNumber(a["profitAndLoss"], "PROFIT_FOR_THE_YEAR"),
              totalAssets: pickNumber(a["balanceSheet"], "TOTAL_ASSETS"),
              equity: pickNumber(a["balanceSheet"], "EQUITY_AND_RESERVES"),
              currency,
            },
          ];
          if (
            String(a["accountsType"]) === "MICRO-ENTITY" ||
            String(a["accountsType"]) === "SMALL"
          ) {
            accountsNote =
              "Conti in formato abbreviato (micro/small entity): alcune voci del conto economico possono non essere pubblicate dalla società.";
          }
        } else {
          accountsNote =
            "Nessun conto annuale (accounts) ancora depositato su Companies House per questa società.";
        }
      } catch {
        accountsNote = "I conti annuali non sono stati recuperati (errore di fonte).";
      }

      return {
        ok: true,
        company: { number: String(number), profile },
        financialYears,
        accountsNote,
      };
    }

    // ---------- MODALITÀ SENZA CHIAVE: scheda via endpoint di ricerca ----------
    const item = bestMatch(await searchItems(name, undefined), name, opts?.preferredNumber);
    if (!item) return { ok: false, error: "Companies House: nessuna società corrispondente" };
    return {
      ok: true,
      company: { number: String(item.company_number ?? ""), profile: profileFromSearchItem(item) },
      accountsNote:
        "Scheda dal registro Companies House (modalità gratuita senza chiave). I conti annuali (bilancio) richiedono la chiave gratuita Companies House: configurala per vederli.",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Companies House: errore" };
  }
}
