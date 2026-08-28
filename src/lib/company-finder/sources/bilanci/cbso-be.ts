// ---------- NBB Central Balance Sheet Office — Belgio ----------
// API ufficiale della Banca Nazionale del Belgio per i conti annuali
// (annual accounts / comptes annuels / jaarrekeningen) depositati e pubblicati.
//
// Documentazione ufficiale:
//   https://www.nbb.be/en/central-balance-sheet-office/consultation/web-services
// Endpoint "Authentic Data Query" (verificata dal bundle SPA consult.cbso.nbb.be
// e dalla doc NBB):
//   GET {base}/authentic/legalEntity/{CBE}/references      (Accept: application/json)
//   GET {base}/authentic/deposit/{depositRef}/accountingData
//        Accept: application/pdf        → PDF ufficiale dei conti
//        Accept: application/x.xbrl     → XBRL
//        Accept: application/x.jsonxbrl → JSON-XBRL (strutturato)
// Header obbligatori: NBB-CBSO-Subscription-Key (chiave primaria, gratuita:
//   signup developer.cbso.nbb.be / ambiente test gratuito developer.uat2.cbso.nbb.be),
//   X-Request-Id.
//
// Il CBE (numero di impresa, 10 cifre) coincide con le cifre del numero IVA BE
// (BE0453966094 → CBE 0453966094).
//
// Ambienti:
//   produzione : https://ws.cbso.nbb.be    (abbonamento via order form)
//   test (free): https://ws.uat2.cbso.nbb.be (chiave gratuita, no order form)

import type { Financials } from "../../types";

const DEFAULT_BASE = "https://ws.cbso.nbb.be";

export interface CbsoResult {
  ok: boolean;
  data?: Financials | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

/** CBE (10 cifre) dal campo partita IVA: per il BE l'IVA = BE + CBE. */
export function cbeFromInput(localVat: string): string | undefined {
  const v = localVat.replace(/\s/g, "");
  return /^\d{10}$/.test(v) ? v : undefined;
}

/** Estrae i riferimenti deposit ({ref, periodEnd}) da una risposta JSON arbitraria. */
function parseReferences(
  raw: unknown,
): Array<{ ref: string; periodEnd?: string | undefined; name?: string }> {
  const out: Array<{ ref: string; periodEnd?: string | undefined; name?: string }> = [];
  const seen = new Set<string>();
  const DEP_REF = /\d{4}-\d{8}/;
  const walk = (o: unknown, depth: number) => {
    if (!o || depth > 8) return;
    if (Array.isArray(o)) {
      for (const it of o) walk(it, depth + 1);
      return;
    }
    if (typeof o === "object") {
      const obj = o as Record<string, unknown>;
      // un nodo con un campo "reference"-like nel testo
      const text = JSON.stringify(obj);
      const m = text.match(DEP_REF);
      if (m && !seen.has(m[0]) && text.length < 2000) {
        seen.add(m[0]);
        out.push({ ref: m[0] });
      }
      for (const v of Object.values(obj)) walk(v, depth + 1);
    }
  };
  walk(raw, 0);
  // ordinamento: i ref NBB sono tipo 2024-00000123 → decrescente
  out.sort((a, b) => b.ref.localeCompare(a.ref));
  return out;
}

export async function fetchCbsoAccounts(
  cbe: string,
  apiKey: string | undefined,
  baseOverride?: string,
  timeoutMs = 25000,
): Promise<CbsoResult> {
  if (!/^\d{10}$/.test(cbe)) return { ok: false, error: "CBE non valido (10 cifre)" };
  if (!apiKey) {
    return {
      ok: false,
      skipped:
        "servi la chiave gratuita NBB-CBSO (developer.cbso.nbb.be → prodotto “Authentic Data Query”; ambiente test gratuito: developer.uat2.cbso.nbb.be) nel campo partita IVA inserisci il CBE (10 cifre)",
    };
  }
  const base = (baseOverride || DEFAULT_BASE).replace(/\/$/, "");
  const headers = {
    "NBB-CBSO-Subscription-Key": apiKey,
    "X-Request-Id": `tpbox-${Date.now()}`,
    Accept: "application/json",
    "User-Agent": "TPbox-CompanyFinder/1.0",
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/authentic/legalEntity/${cbe}/references`, {
      headers,
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: "NBB CBSO: chiave non valida o non abilitata sul prodotto “Authentic Data Query”",
      };
    }
    if (res.status === 404) {
      return { ok: false, error: "NBB CBSO: nessun conto annuale pubblicato per questo CBE" };
    }
    if (!res.ok) return { ok: false, error: `NBB CBSO HTTP ${res.status}` };

    const raw = await res.json();
    const refs = parseReferences(raw);
    const latest = refs[0];
    // stessa condizione di prima: nessun riferimento estratto → nessun conto pubblicato
    if (refs.length === 0 || !latest) {
      return { ok: false, error: "NBB CBSO: nessun conto annuale pubblicato per questo CBE" };
    }
    const docUrl = `${base}/authentic/deposit/${latest.ref}/accountingData`;
    // servito IN PAGINA dal proxy del tool (accept PDF: il gateway CBSO sceglie
    // la rappresentazione in base all'header Accept)
    const proxied = `/api/company-finder/document?url=${encodeURIComponent(docUrl)}&accept=${encodeURIComponent("application/pdf")}`;

    return {
      ok: true,
      data: {
        available: true,
        years: [],
        documentUrl: proxied,
        documentTitle: `Conti annuali pubblicati (CBE ${cbe}) — riferimento ${latest.ref}`,
        source: "NBB Central Balance Sheet Office — conti annuali ufficiali (Belgio)",
        note: "Documento ufficiale dei conti annuali depositati presso la Banque nationale de Belgique (PDF). Il proxy del tool lo serve in pagina: nessun reindirizzamento.",
      },
    };
  } catch (e) {
    const err = e as { name?: string | undefined; message?: string } | undefined;
    return {
      ok: false,
      error:
        err?.name === "AbortError" ? "NBB CBSO: timeout" : `NBB CBSO: ${err?.message ?? "errore"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
