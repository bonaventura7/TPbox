// ---------- ARES — Cechia: Aliance Registrů a Soudního rejstříku ----------
// API pubblica del Ministero della Giustizia CZ, gratuita, senza chiave.
// Docs: https://www.ares.gov.cz/argic/rest/
// Endpoint (versione data): /argic/rest/ares/{verze}/zapsane-osobnosti?filter=...
// NOTE: il dominio può non risolvere da alcuni ambienti (DNS): in produzione
// (Vercel/AWS EU) è raggiungibile. L'adapter è best-effort.

import type { ActivityCode, CompanyProfile, Identifier } from "../types";
import { getCountry } from "../countries";

// Nota: l'host api.ares.gov.cz non è risolvibile da alcune reti (es. sandbox);
// in produzione (Vercel/AWS) è raggiungibile. L'host www espone solo la SPA
// HTML, NON il REST — non va usato come fallback.
const BASES = [
  "https://api.ares.gov.cz/argic/rest/ares/2024-07-01",
  "https://api.ares.gov.cz/argic/rest/ares/2023-01-01",
];

export interface AresResult {
  ok: boolean;
  data?: CompanyProfile | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

interface AresOsobnost {
  id: string;
  obchodniFirma: string;
  ico?: string | undefined;
  rodneCisloPravnickehoOsobeni?: string | undefined;
  datumZahactiCinnosti?: string | undefined;
  pravniForma?: { nazev?: string } | undefined;
  adresa?: {
    ulice?: string | undefined;
    psc?: string | undefined;
    obciSeSpravniRozhranicenim?: { nazev?: string } | undefined;
    obciCast?: { nazev?: string } | undefined;
  };
  zakladCinnosti?: string | undefined;
  cinnostHlavni?: { kodCinnosti?: string | undefined; popis?: string } | undefined;
  cinnosti?: Array<{ kodCinnosti?: string | undefined; popis?: string }> | undefined;
}

function normCz(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .toLowerCase();
}

function czSimilarity(name: string, query: string): number {
  const a = normCz(name);
  const b = normCz(query);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.startsWith(b) || b.startsWith(a)) return 0.9;
  if (a.includes(b) || b.includes(a)) return 0.75;
  return 0;
}

/** Scegli il risultato più simile alla query (per IČO esatto prende il primo). */
function pickBestCz(items: AresOsobnost[], query: string): AresOsobnost | null {
  if (!items.length) return null;
  if (/^\d{6,8}$/.test(query)) return items[0] ?? null;
  let best: AresOsobnost | undefined = items[0];
  let bestScore = 0;
  for (const it of items) {
    const score = czSimilarity(it.obchodniFirma ?? "", query);
    if (score > bestScore) {
      bestScore = score;
      best = it;
    }
  }
  return best ?? null;
}

async function searchOsobnosti(
  base: string,
  query: string,
  signal: AbortSignal,
): Promise<AresOsobnost | null> {
  // Query numerica (6-8 cifre) → ricerca per IČO; altrimenti per ragione sociale.
  const isIco = /^\d{6,8}$/.test(query);
  const f = isIco ? `ico.il.*${query}*` : `obchodniFirma.il.*${query}*`;
  const url = `${base}/zapsane-osobnosti?filter=${encodeURIComponent(f)}&size=5`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`ARES HTTP ${res.status}`);
  const json = await res.json();
  const items = (json._embedded?.zapsaneOsobnosti || []) as AresOsobnost[];
  return pickBestCz(items, query);
}

export async function searchAres(query: string, timeoutMs = 12000): Promise<AresResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let lastErr: string | undefined;
    for (const base of BASES) {
      try {
        const o = await searchOsobnosti(base, query, ctrl.signal);
        if (!o) return { ok: false, error: "ARES: nessuna corrispondenza" };
        const country = getCountry("CZ")!;
        const activityCodes: ActivityCode[] = [o.cinnostHlavni, ...(o.cinnosti || [])]
          .flatMap((c) => (c ? [c] : []))
          .slice(0, 10)
          .map((c) => ({
            code: c.kodCinnosti ? String(c.kodCinnosti) : "",
            label: c.popis ? String(c.popis).toLowerCase() : undefined,
          }));
        const identifiers: Identifier[] = [];
        if (o.ico) identifiers.push({ key: "IČO", value: String(o.ico) });
        if (o.rodneCisloPravnickehoOsobeni)
          identifiers.push({ key: "ID registru", value: String(o.rodneCisloPravnickehoOsobeni) });

        const profile: CompanyProfile = {
          name: o.obchodniFirma,
          nameSource: "ARES",
          country,
          registry: {
            name: "Obchodní rejstřík (ARES)",
            authority: "Ministerstvo spravedlnosti ČR",
            // exactOptionalPropertyTypes: la proprietà id va omessa (non messa a
            // undefined) quando l'IČO non è disponibile.
            ...(o.ico ? { id: `IČO ${o.ico}` } : {}),
          },
          legalForm: o.pravniForma?.nazev ? String(o.pravniForma.nazev).toLowerCase() : undefined,
          status: "aktivní (registrato)",
          registeredSince: o.datumZahactiCinnosti,
          address: o.adresa
            ? [
                o.adresa.ulice,
                o.adresa.obciCast?.nazev || o.adresa.obciSeSpravniRozhranicenim?.nazev,
                o.adresa.psc,
              ]
                .filter(Boolean)
                .join(", ")
                .toLowerCase()
            : undefined,
          activityCodes,
          identifiers,
        };
        return { ok: true, data: profile };
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
    }
    return { ok: false, error: lastErr || "ARES: non raggiungibile" };
  } finally {
    clearTimeout(timer);
  }
}
