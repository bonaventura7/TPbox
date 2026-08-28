// ---------- Regnskaber — Danimarca: annual reports (årsrapporter) ufficiali ----------
// I bilanci danesi (årsrapporter) sono pubblici e GRATUITI dal 2004:
// PDF e XBRL sul portale ufficiale regnskaber.virk.dk (Erhvervsstyrelsen).
//
// Metadati + link ai documenti: endpoint regnskab di cvr.dev (dati CVR raw,
// chiave gratuita CVR_DEV_API_KEY). Senza chiave la fonte è segnalata
// come "chiave richiesta" (il portale ufficiale resta consultabile).
//
//   GET https://api.cvr.dev/api/cvr/regnskab?cvr_nummer={cvr}
//
// Il CVR-nummer (8-9 cifre) coincide con le cifre del numero IVA danese.

import type { Financials } from "../../types";

const CVRDEV = "https://api.cvr.dev/api/cvr";

export interface RegnskabResult {
  ok: boolean;
  data?: Financials | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

/** CVR-nummer dal numero IVA danese (senza prefisso). */
export function cvrFromVat(localVat: string): string | undefined {
  const digits = localVat.replace(/\D/g, "");
  if (/^\d{8,9}$/.test(digits)) return digits;
  return undefined;
}

/** Cerca ricorsivamente le URL di regnskaber.virk.dk dentro un JSON arbitrario. */
function findDocUrls(node: unknown, found: string[] = []): string[] {
  if (typeof node === "string") {
    if (node.includes("regnskaber.virk.dk")) found.push(node);
    return found;
  }
  if (Array.isArray(node)) {
    for (const x of node) findDocUrls(x, found);
    return found;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) findDocUrls(v, found);
  }
  return found;
}

interface RegnskabPeriod {
  startDato?: string | undefined;
  endDato?: string | undefined;
}

export async function fetchDkRegnskaber(
  cvrNummer: string,
  apiKey: string | undefined,
  timeoutMs = 20000,
): Promise<RegnskabResult> {
  if (!apiKey) {
    return {
      ok: false,
      skipped:
        "CVR_DEV_API_KEY non configurata (chiave gratuita: cvr.dev): necessaria per i metadati dei regnskaber; i PDF/XBRL ufficiali restano gratuiti su regnskaber.virk.dk",
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `${CVRDEV}/regnskab?cvr_nummer=${encodeURIComponent(cvrNummer)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "User-Agent": "TPbox-CompanyFinder/1.0",
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "CVR-dev: chiave non valida (401/403)" };
    if (!res.ok) return { ok: false, error: `CVR-dev HTTP ${res.status}` };
    const json = (await res.json()) as Record<string, unknown>;

    const periods = Array.isArray(json["regnskaber"])
      ? (json["regnskaber"] as Array<{ regnskab?: { regnskabsperiode?: RegnskabPeriod } }>)
      : [];

    const docUrls = findDocUrls(json)
      .map((u) => u.replace(/^http:\/\//, "https://"))
      .filter((u, i, a) => a.indexOf(u) === i);

    if (docUrls.length === 0 && periods.length === 0) {
      return {
        ok: true,
        data: {
          available: false,
          years: [],
          note: `CVR ${cvrNummer}: nessun årsrapport indicizzato (la società potrebbe non aver depositato o il dato non è ancora disponibile).`,
        },
      };
    }

    const pdf = docUrls.find((u) => u.toLowerCase().endsWith(".pdf")) ?? docUrls[0];
    const year = periods[0]?.regnskab?.regnskabsperiode?.endDato?.slice(0, 4);

    return {
      ok: true,
      data: {
        available: true,
        years: [],
        source: "Regnskaber.virk.dk (DK) — årsrapport ufficiale gratuita",
        documentUrl: pdf
          ? `/api/company-finder/document?url=${encodeURIComponent(pdf)}`
          : undefined,
        documentTitle: `Årsrapport${year ? ` ${year}` : ""} — CVR ${cvrNummer}`,
        note: "Annualità depositata (PDF e/o XBRL) servita in pagina dal proxy del tool; nessun reindirizzamento.",
      },
    };
  } catch (e) {
    const err = e as
      | { name?: string | undefined; message?: string | undefined; cause?: { code?: string } }
      | undefined;
    const code = err?.cause?.code;
    const msg =
      err?.name === "AbortError"
        ? "timeout"
        : code === "ENOTFOUND" || code === "ECONNREFUSED"
          ? "fonte non raggiungibile"
          : (err?.message ?? "errore");
    return { ok: false, error: `Regnskaber DK: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
