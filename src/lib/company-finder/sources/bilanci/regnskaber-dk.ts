// ---------- Regnskaber — Danimarca: årsrapporter ufficiali, gratuiti ----------
// I bilanci danesi sono pubblici e gratuiti dal 2004. Erhvervsstyrelsen li
// distribuisce su un indice Elasticsearch APERTO, senza chiave e senza
// registrazione:
//
//   POST http://distribution.virk.dk/offentliggoerelser/_search
//   { "query": { "term": { "cvrNummer": <cvr> } },
//     "sort":  [ { "offentliggoerelsesTidspunkt": "desc" } ] }
//
// Ogni pubblicazione porta il periodo contabile e i documenti depositati
// (PDF, XHTML, XBRL) su regnskaber.virk.dk, serviti in pagina dal proxy.
//
// La versione precedente passava da api.cvr.dev, che richiede una chiave: senza
// chiave la Danimarca restava scoperta. Questa fonte è ufficiale e non ne vuole.

import type { Financials } from "../../types";

const SEARCH_URL = "http://distribution.virk.dk/offentliggoerelser/_search";

export interface RegnskabResult {
  ok: boolean;
  data?: Financials | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

/** CVR-nummer dalle cifre dell'IVA danese (o dal numero CVR digitato). */
export function cvrFromVat(localVat: string): string | undefined {
  const digits = localVat.replace(/\D/g, "");
  return /^\d{8}$/.test(digits) ? digits : undefined;
}

interface VirkDocument {
  dokumentUrl?: string | undefined;
  dokumentMimeType?: string | undefined;
  dokumentType?: string | undefined;
}

interface VirkSource {
  cvrNummer?: number | undefined;
  offentliggoerelsestype?: string | undefined;
  offentliggoerelsesTidspunkt?: string | undefined;
  regnskab?:
    | {
        regnskabsperiode?:
          { startDato?: string | undefined; slutDato?: string | undefined } | undefined;
      }
    | undefined;
  dokumenter?: VirkDocument[] | undefined;
}

interface VirkResponse {
  hits?: { hits?: { _source?: VirkSource | undefined }[] | undefined } | undefined;
}

/** Anno dell'esercizio, dal periodo contabile o dalla data di pubblicazione. */
function periodLabel(source: VirkSource): string {
  const end = source.regnskab?.regnskabsperiode?.slutDato;
  const start = source.regnskab?.regnskabsperiode?.startDato;
  if (end && start) {
    const endYear = end.slice(0, 4);
    const startYear = start.slice(0, 4);
    return startYear === endYear ? `Esercizio ${endYear}` : `Esercizio ${startYear}/${endYear}`;
  }
  const published = source.offentliggoerelsesTidspunkt;
  return published ? `Pubblicato ${published.slice(0, 10)}` : "Esercizio non datato";
}

/** PDF se c'è, altrimenti XHTML leggibile, altrimenti il primo documento. */
function pickDocument(documents: VirkDocument[]): VirkDocument | undefined {
  const withUrl = documents.filter((doc) => typeof doc.dokumentUrl === "string");
  return (
    withUrl.find((doc) => doc.dokumentMimeType === "application/pdf") ??
    withUrl.find((doc) => doc.dokumentMimeType === "application/xhtml+xml") ??
    withUrl[0]
  );
}

export async function fetchDkRegnskaber(
  cvrNummer: string,
  timeoutMs = 15000,
): Promise<RegnskabResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: { term: { cvrNummer: Number(cvrNummer) } },
        size: 10,
        sort: [{ offentliggoerelsesTidspunkt: "desc" }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `Regnskaber HTTP ${res.status}` };

    const json = (await res.json()) as VirkResponse;
    const hits = (json.hits?.hits ?? [])
      .map((hit) => hit._source)
      .filter((source): source is VirkSource => Boolean(source))
      .filter((source) => (source.offentliggoerelsestype ?? "regnskab") === "regnskab");

    if (hits.length === 0) {
      return {
        ok: false,
        error: `nessun bilancio depositato per il CVR ${cvrNummer}`,
      };
    }

    // Il documento mostrato è quello dell'esercizio più recente; gli altri
    // esercizi disponibili restano dichiarati nella nota.
    const latest = hits[0]!;
    const document = pickDocument(latest.dokumenter ?? []);
    if (!document?.dokumentUrl) {
      return { ok: false, error: "pubblicazione senza documenti allegati" };
    }

    const periods = hits.map(periodLabel);
    const proxied = `/api/company-finder/document?url=${encodeURIComponent(document.dokumentUrl)}`;

    // ponytail: si serve il documento, non si estraggono i valori. L'XBRL
    // danese è disponibile allo stesso indirizzo (mime application/xml):
    // parsarlo è il passo successivo, se servono le tabelle per esercizio.
    const data: Financials = {
      available: true,
      years: [],
      source: `Regnskaber (CVR ${cvrNummer}) — Erhvervsstyrelsen`,
      documentUrl: proxied,
      documentTitle: `Årsrapport · ${periodLabel(latest)}`,
      note:
        `Esercizi depositati e consultabili: ${periods.slice(0, 8).join(", ")}` +
        (hits.length > 8 ? ` e altri ${hits.length - 8}.` : ".") +
        " Fonte ufficiale gratuita, nessuna chiave richiesta.",
    };
    return { ok: true, data };
  } catch (e) {
    const err = e as { name?: string | undefined; message?: string | undefined };
    return {
      ok: false,
      error:
        err?.name === "AbortError"
          ? "Regnskaber: timeout"
          : (err?.message ?? "Regnskaber: errore di rete"),
    };
  } finally {
    clearTimeout(timer);
  }
}
