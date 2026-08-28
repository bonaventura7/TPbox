// ---------- Repozytorium Dokumentów Finansowych (RDF) — Polonia ----------
// Fonte UFFICIALE GRATUITA del Ministero della Giustizia PL: i documenti
// finanziari (sprawozdania finansowe = bilanci, XML e PDF) depositati in KRS
// sono pubblici e scaricabili senza account ("dostęp publiczny i nieograniczony").
//
// Documentazione: https://www.parp.gov.pl (Możliwości wykorzystania danych rejestrowych)
// e https://ekrs.ms.gov.pl/rdf/rd/ (portal, sezione "Bezpłatne wyszukanie i
// pobranie dokumentu finansowego").
//
// Pagina di ricerca (storico, confermata da documentazione e SO):
//   GET https://ekrs.ms.gov.pl/rdf/pd/search_df?unloggedForm:krs2={nr KRS}
// Il numero KRS (8 cifre) è il PRIMO campo della scheda KRS (già risolto
// dall'orchestratore o inserito dall'utente nel campo partita IVA).
//
// ATTENZIONE ambiente: il portale è protetto da anti-bot (Imperva/Incapsula)
// che può bloccare IP di datacenter (es. sandbox): in quel caso l'adapter
// degrada onestamente (skip con nota) e in produzione (Vercel, AWS EU)
// la fonte è raggiungibile. Il documento recuperato viene servito IN PAGINA
// dal proxy del tool (nessun reindirizzamento).

import type { Financials } from "../../types";

const RDF_SEARCH = "https://ekrs.ms.gov.pl/rdf/pd/search_df";

export interface RdfResult {
  ok: boolean;
  data?: Financials | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Estrae i link ai documenti (pdf/xml) da una pagina HTML della ricerca RDF. */
function extractDocumentLinks(html: string, base: URL): string[] {
  const out: string[] = [];
  const re = /(?:href|src|url)\s*=\s*["']([^"']+\.(?:pdf|xml)(?:\?[^"']*)?)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] ?? "").trim();
    if (!raw || raw.startsWith("javascript:") || raw.startsWith("#")) continue;
    try {
      const abs = new URL(raw, base);
      if (abs.hostname.endsWith("ekrs.ms.gov.pl") || abs.hostname === "ekrs.ms.gov.pl")
        out.push(abs.toString());
    } catch {
      /* link non assoluto e non risolvibile */
    }
  }
  // preferisce PDF (documento ufficiale), poi XML
  return out.sort((a, b) => (b.endsWith(".pdf") ? 1 : 0) - (a.endsWith(".pdf") ? 1 : 0));
}

/** KRS dal campo partita IVA: 8 cifre (formato storico) o 10 cifre (moderno). */
export function krsFromPlInput(localVat: string): string | undefined {
  const v = localVat.replace(/\s/g, "");
  return /^\d{8,10}$/.test(v) ? v : undefined;
}

export async function fetchKrsRdfDocuments(krs: string, timeoutMs = 25000): Promise<RdfResult> {
  if (!/^\d{8,10}$/.test(krs)) return { ok: false, error: "numero KRS non valido (8 o 10 cifre)" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `${RDF_SEARCH}?unloggedForm%3Akrs2=${encodeURIComponent(krs)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status === 403 || res.status === 429 || res.status === 503) {
      return {
        ok: false,
        skipped:
          "la fonte ufficiale dei bilanci PL (Repozytorium Dokumentów Finansowych KRS) ha rifiutato la richiesta da questo ambiente (protezione anti-bot). I documenti sono pubblici: riprova più tardi.",
      };
    }
    if (!res.ok) return { ok: false, error: `RDF KRS HTTP ${res.status}` };

    const html = await res.text();
    const links = extractDocumentLinks(html, new URL(RDF_SEARCH));
    const doc = links[0];
    // stessa condizione di prima: nessun link estratto → nessun documento trovato
    if (links.length === 0 || !doc) {
      return {
        ok: false,
        skipped:
          "nessun documento finanziario trovato per questo numero KRS (o il portale non ha restituito i link da questo ambiente).",
      };
    }
    const isPdf = doc.endsWith(".pdf");
    // servito IN PAGINA dal proxy del tool (nessun reindirizzamento)
    const proxied = `/api/company-finder/document?url=${encodeURIComponent(doc)}`;
    return {
      ok: true,
      data: {
        available: true,
        years: [],
        documentUrl: proxied,
        documentTitle: `Sprawozdanie finansowe (bilancio) — KRS ${krs} · Repozytorium Dokumentów Finansowych`,
        source:
          "Ministerstwo Sprawiedliwości PL — Repozytorium Dokumentów Finansowych (KRS), gratuito e pubblico",
        note: `Documento ufficiale ${isPdf ? "PDF" : "XML"} del bilancio depositato in KRS, servito in pagina dal proxy del tool (nessun reindirizzamento).`,
      },
    };
  } catch (e) {
    const err = e as { name?: string | undefined; message?: string } | undefined;
    return {
      ok: false,
      error:
        err?.name === "AbortError" ? "RDF KRS: timeout" : `RDF KRS: ${err?.message ?? "errore"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
