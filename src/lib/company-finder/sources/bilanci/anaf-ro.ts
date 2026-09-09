// ---------- Romania: ANAF bilanț — situații financiare, API pubblica ----------
// L'Agenzia Fiscale (ANAF) espone, GRATIS e senza chiave, gli indicatori
// pubblici dei bilanci annuali (bilanț) per codice CUI:
//
//   GET https://webservicesp.anaf.ro/bilant?an={yyyy}&cui={cui}
//
// Verificato in produzione (OMV Petrom, an=2023): la risposta è
//   { "an":2023, "cui":1590082, "deni":"OMV PETROM SA", "caen":610,
//     "i":[{"indicator":"I1","val_indicator":...,"val_den_indicator":"..."} , ... ] }
// Indicatori usati (codice stabile, non la dicitura in rumeno):
//   I1+I2 attivo (immobilizzato + circolante) · I10 patrimonio netto
//   I13 fatturato netto · I16/I17 utile/perdita lorda · I18/I19 utile/perdita
//   netta · I20 dipendenti medi
// Limiti documentati: un solo anno per chiamata, anni dal 2014, ~1 richiesta/s.
// Il CUI sono le cifre del numero IVA rumeno (RO + CUI): nessuna risoluzione
// per nome. Per il documento integrale resta la pagina consigliata
// (mfinante.gov.ro / ONRC) già offerta dal tool.

import type { Financials, FinancialYear } from "../../types";

const ENDPOINT = "https://webservicesp.anaf.ro/bilant";

export interface RoBilantYear {
  an: number;
  deni?: string | undefined;
  denCaen?: string | undefined;
  indicators: Map<string, number>;
}

export interface RoResult {
  ok: boolean;
  data?: Financials | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
  note?: string | undefined;
}

/** CUI rumeno: 2-10 cifre (il prefisso RO è già rimosso dall'orchestratore). */
export function cuiFromInput(localVat: string): string | undefined {
  const v = localVat.replace(/\s/g, "");
  return /^\d{2,10}$/.test(v) ? String(Number(v)) : undefined;
}

/** Mappa indicatori → FinancialYear. Perdite registrate come valori negativi. */
export function mapBilantYear(row: RoBilantYear): FinancialYear {
  const ind = row.indicators;
  const pick = (code: string): number | undefined => ind.get(code);
  const signed = (pos: number | undefined, neg: number | undefined): number | undefined => {
    if (pos !== undefined && pos > 0) return pos;
    if (neg !== undefined && neg > 0) return -neg;
    if (pos !== undefined) return pos;
    return undefined;
  };
  const a1 = pick("I1");
  const a2 = pick("I2");
  const net = signed(pick("I18"), pick("I19"));
  const gross = signed(pick("I16"), pick("I17"));
  return {
    periodLabel: `Esercizio ${row.an}`,
    year: row.an,
    ...(pick("I13") !== undefined ? { revenue: pick("I13") } : {}),
    ...(gross !== undefined ? { operatingProfit: gross } : {}),
    ...(net !== undefined ? { netIncome: net } : {}),
    ...(a1 !== undefined && a2 !== undefined ? { totalAssets: a1 + a2 } : {}),
    ...(pick("I10") !== undefined ? { equity: pick("I10") } : {}),
    currency: "RON",
  };
}

async function fetchYear(
  cui: string,
  an: number,
  timeoutMs: number,
): Promise<{ row?: RoBilantYear; status: number; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${ENDPOINT}?an=${an}&cui=${cui}`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return { status: res.status };
    const json = (await res.json()) as {
      deni?: string;
      den_caen?: string;
      i?: { indicator?: string; val_indicator?: number }[] | null;
    };
    const indicators = new Map<string, number>();
    for (const item of json.i ?? []) {
      if (item?.indicator && typeof item.val_indicator === "number") {
        indicators.set(item.indicator, item.val_indicator);
      }
    }
    if (indicators.size === 0) return { status: 404 };
    return {
      status: 200,
      row: {
        an,
        ...(json.deni ? { deni: json.deni } : {}),
        ...(json.den_caen ? { denCaen: json.den_caen } : {}),
        indicators,
      },
    };
  } catch (e) {
    const err = e as { name?: string | undefined; message?: string | undefined };
    return {
      status: -1,
      error:
        err?.name === "AbortError"
          ? "ANAF bilanț: timeout"
          : (err?.message ?? "ANAF bilanț: errore di rete"),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ultimi esercizi disponibili (default 3, ricerca a ritroso su 4 anni).
 * Le chiamate sono SEQUENZIALI: il servizio è dichiarato a ~1 richiesta/s e
 * un 429 non deve mai azzerare un risultato parziale.
 */
export async function fetchRoBilanta(
  cui: string,
  wanted = 3,
  timeoutMs = 12000,
): Promise<RoResult> {
  const current = new Date().getFullYear();
  const found: RoBilantYear[] = [];
  let firstError: string | undefined;
  let rateLimited = false;

  for (let an = current - 1; an >= current - 4 && found.length < wanted; an--) {
    const r = await fetchYear(cui, an, timeoutMs);
    if (r.row) {
      found.push(r.row);
      continue;
    }
    if (r.status === 400) {
      return { ok: false, error: `CUI ${cui} non valido per ANAF (HTTP 400)` };
    }
    if (r.status === 429) {
      rateLimited = true;
      firstError = "ANAF: rate limit (1 richiesta/s), riprova tra poco";
      break;
    }
    if (r.status === -1) {
      firstError = r.error;
      break; // rete assente: inutile insistere sugli anni successivi
    }
    // 404: anno non pubblicato, si prova il precedente
  }

  if (found.length === 0) {
    return {
      ok: false,
      error:
        firstError ??
        `nessun bilanț pubblico ANAF per il CUI ${cui} negli ultimi 4 esercizi (entità senza obbligo di pubblicazione o CUI errato)`,
    };
  }

  const first = found[0]!;
  const data: Financials = {
    available: true,
    currency: "RON",
    years: found.map(mapBilantYear),
    source: `ANAF bilanț — situații financiare (CUI ${cui})`,
    note:
      `Indicatori ufficiali ANAF per ${first.deni ?? `CUI ${cui}`}` +
      (first.denCaen ? ` (CAEN: ${first.denCaen})` : "") +
      ": fatturato, risultato lordo/netto, attivo e patrimonio per esercizio, in RON. " +
      "Il documento integrale depositato resta su ONRC; la pagina Ministero delle Finanze è collegata sotto." +
      (rateLimited ? " Elenco parziale: rate limit ANAF raggiunto." : ""),
  };
  return {
    ok: true,
    data,
    ...(rateLimited ? { note: "parziale: rate limit ANAF" } : {}),
  };
}
