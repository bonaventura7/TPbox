// ---------- Pappers — Francia: dati finanziari ufficiali (comptes annuels) ----------
// Pappers (API gratuita con chiave) indicizza i bilanci (comptes annuels)
// depositati presso i tribunali di commercio francesi: dati strutturati
// (ricavi, utile netto, patrimonio, attivo) per esercizio.
//
//   GET https://api.pappers.fr/v1/companies?search={q}
//   GET https://api.pappers.fr/v1/companies/{siren}/financial_data
//
// Richiede PAPPERS_API_KEY (gratuita, da pappers.fr/developer).
// Il SIREN (9 cifre) si ricava dall'IVA francese: FR + 2 cifre + SIREN.

import type { FinancialYear, Financials } from "../../types";
import { sirenFromVat } from "../inpi-fr";

const BASE = "https://api.pappers.fr/v1";

export interface PappersResult {
  ok: boolean;
  data?: Financials | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

interface PappersCompany {
  siren?: string | undefined;
  name?: string | undefined;
}

interface PappersFinancial {
  exercise?: string | undefined;
  revenue?: number | undefined;
  net_income?: number | undefined;
  equity?: number | undefined;
  total_assets?: number | undefined;
  ebitda?: number | undefined;
  operating_income?: number | undefined;
  cash_flow?: number | undefined;
  net_wealth?: number | undefined;
}

async function apiGet(path: string, apiKey: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "User-Agent": "TPbox-CompanyFinder/1.0",
    },
    signal,
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403)
    throw new Error("PAPPERS_API_KEY non valida o piano non abilitato");
  if (res.status === 429) throw new Error("Pappers: rate limit del piano gratuito raggiunto");
  if (!res.ok) throw new Error(`Pappers HTTP ${res.status}`);
  return res.json();
}

export async function fetchPappersFinancials(
  siren: string | undefined,
  companyName: string,
  apiKey: string,
  timeoutMs = 20000,
): Promise<PappersResult> {
  if (!apiKey)
    return {
      ok: false,
      skipped: "PAPPERS_API_KEY non configurata (chiave gratuita: pappers.fr/developer)",
    };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // 1) risolvi SIREN: dall'IVA, o per nome
    let siren_ = siren;
    let name: string | undefined;
    if (!siren_) {
      const q = encodeURIComponent(companyName);
      const list = (await apiGet(`/companies?search=${q}&per_page=1`, apiKey, ctrl.signal)) as {
        data?: PappersCompany[] | undefined;
      };
      const c = list.data?.[0];
      if (!c?.siren) return { ok: false, error: "Pappers: impresa non trovata per nome" };
      siren_ = c.siren;
      name = c.name;
    }

    // 2) dati finanziari (ultimi 5 esercizi)
    const fd = (await apiGet(
      `/companies/${siren_}/financial_data?per_page=5`,
      apiKey,
      ctrl.signal,
    )) as {
      data?: PappersFinancial[] | undefined;
    };
    const rows = (fd.data ?? []).sort((a, b) =>
      String(b.exercise ?? 0).localeCompare(String(a.exercise ?? 0)),
    );
    if (rows.length === 0) {
      return {
        ok: true,
        data: {
          available: false,
          years: [],
          note: `SIREN ${siren_} trovata ma nessun conto annuale (comptes annuels) depositato indicizzato da Pappers.`,
        },
      };
    }
    const years: FinancialYear[] = rows.map((r) => ({
      periodLabel: `Esercizio ${r.exercise}`,
      revenue: r.revenue,
      operatingProfit: r.operating_income,
      ebitda: r.ebitda,
      netIncome: r.net_income,
      totalAssets: r.total_assets,
      equity: r.equity,
      currency: "EUR",
    }));

    return {
      ok: true,
      data: {
        available: true,
        currency: "EUR",
        years,
        source: "Pappers — comptes annuels depositati presso i tribunali di commercio (FR)",
        note: name ? undefined : undefined,
      },
    };
  } catch (e) {
    const err = e as { name?: string | undefined; message?: string } | undefined;
    return {
      ok: false,
      error:
        err?.name === "AbortError" ? "Pappers: timeout" : `Pappers: ${err?.message ?? "errore"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export { sirenFromVat };
