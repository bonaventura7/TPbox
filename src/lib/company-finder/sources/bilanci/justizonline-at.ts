// ---------- Austria: JustizOnline HVD — Firmenbuch (BMJ), gratuita ----------
// Dal marzo 2025 il Ministero della Giustizia austriaco pubblica i dati del
// Firmenbuch come High Value Dataset (reg. UE 2023/138, allegato 5), licenza
// CC-BY 4.0, aggiornamento giornaliero, tramite un'API SOAP ufficiale:
//
//   POST https://justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws
//   Headers: Content-Type: application/soap+xml;charset=UTF-8
//            SOAPAction: ""
//            X-Api-Key: <chiave gratuita>
//
// La chiave è GRATUITA e si richiede su:
//   https://justizonline.gv.at/jop/web/iwg/register
// Documentazione: https://justizonline.gv.at/jop/web/iwg (WebService HVD).
//
// Operazioni usate (wsdl ns://firmenbuch.justiz.gv.at/Abfrage):
//   SUCHEFIRMAREQUEST   — ricerca per Firmenwortlaut → FNR
//   SUCHEURKUNDEREQUEST — elenco Urkunden (atti) di un FNR, tra cui i
//                         Jahresabschlüsse depositati
//
// Senza chiave il paese non sparisce: la ricerca degrada alla pagina gratuita
// openfirmenbuch.at (interfaccia della stessa API, PDF senza account), vedi
// official-pages.ts. Lo stesso identificativo IVA austriaco (ATU########) NON
// contiene la Firmenbuchnummer: senza ragione sociale o FN la fonte si dichiara
// "skipped" con istruzione esplicita, mai un dato inventato.
//
// Le risposte SOAP non hanno qui uno schema garantito: il parser è volutamente
// euristico e tollerante (blocchi per tag candidati, fallback per coppie di
// tag in ordine di comparsa). Peggior caso verificabile: zero documenti
// trovati, mai un crash né un documento inventato.

import type { FinancialDocumentSummary, Financials, FinancialYear } from "../../types";

const ENDPOINT = "https://justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws";

export interface AtFirm {
  fnr: string;
  name: string;
  seat?: string | undefined;
}

export interface AtUrkunde {
  id: string;
  kind: FinancialDocumentSummary["kind"];
  format: FinancialDocumentSummary["format"];
  title: string;
  year?: number | undefined;
  date?: string | undefined;
  url?: string | undefined;
}

export interface AtResult {
  ok: boolean;
  data?: Financials | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

// ---------------------------------------------------------------------------
// Identificativi
// ---------------------------------------------------------------------------

/** La Firmenbuchnummer: 1-7 cifre + eventuale lettera ("123456a", "FN 629 a "). */
export function fnFromInput(value: string): string | undefined {
  const v = value.trim().replace(/^fn\s*:?\s*/i, "");
  const m = v.match(/^(\d{1,7})\s*([a-zA-Z]{1,2})$/);
  return m ? `${m[1]} ${m[2]!.toLowerCase()}` : undefined;
}

// ---------------------------------------------------------------------------
// Envelope SOAP (l'unico punto in cui si scrive XML: input SEMPRE escaped)
// ---------------------------------------------------------------------------

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Ricerca società per denominazione. EXAKTESUCHE=false: l'utente non conosce
 *  quasi mai la grafia esatta del Firmenwortlaut; il match migliore lo
 *  scegliamo noi lato client. */
export function buildSucheFirmaEnvelope(firmenwortlaut: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" ` +
    `xmlns:suc="ns://firmenbuch.justiz.gv.at/Abfrage/SucheFirmaRequest">\n` +
    `  <soap:Header/>\n  <soap:Body>\n    <suc:SUCHEFIRMAREQUEST>\n` +
    `      <suc:FIRMENWORTLAUT>${xmlEscape(firmenwortlaut)}</suc:FIRMENWORTLAUT>\n` +
    `      <suc:EXAKTESUCHE>false</suc:EXAKTESUCHE>\n` +
    `      <suc:SUCHBEREICH>1</suc:SUCHBEREICH>\n` +
    `    </suc:SUCHEFIRMAREQUEST>\n  </soap:Body>\n</soap:Envelope>`
  );
}

/** Elenco atti (Urkunden) di una società, per Firmenbuchnummer. */
export function buildSucheUrkundeEnvelope(fnr: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" ` +
    `xmlns:suc="ns://firmenbuch.justiz.gv.at/Abfrage/SucheUrkundeRequest">\n` +
    `  <soap:Header/>\n  <soap:Body>\n    <suc:SUCHEURKUNDEREQUEST>\n` +
    `      <suc:FNR>${xmlEscape(fnr)}</suc:FNR>\n` +
    `    </suc:SUCHEURKUNDEREQUEST>\n  </soap:Body>\n</soap:Envelope>`
  );
}

// ---------------------------------------------------------------------------
// Parser XML euristici (senza DOM: runtime edge non ha DOMParser in tutti i
// contesti; regex su tag locali, i prefissi di namespace sono ignorati)
// ---------------------------------------------------------------------------

function tagName(local: string): RegExp {
  return new RegExp(`<(?:[\\w.-]+:)?${local}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${local}>`, "gi");
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function tagValues(xml: string, local: string): string[] {
  const out: string[] = [];
  const re = tagName(local);
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const v = unescapeXml(m[1]!.replace(/<[^>]+>/g, " ").trim());
    if (v) out.push(v);
  }
  return out;
}

/** Primo valore utile tra più nomi di tag candidati. */
function firstValue(xml: string, locals: string[]): string | undefined {
  for (const local of locals) {
    const v = tagValues(xml, local)[0];
    if (v) return v;
  }
  return undefined;
}

function extractBlocks(xml: string, locals: string[]): string[] {
  for (const local of locals) {
    const out: string[] = [];
    const re = tagName(local);
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) out.push(m[1]!);
    if (out.length > 0) return out;
  }
  return [];
}

/** Intercetta un SOAP Fault (1.1 e 1.2) o un errore applicativo HVD. */
function soapError(xml: string): string | undefined {
  const hvd = firstValue(xml, ["MELDUNG", "FEHLER", "FEHLERTEXT", "ERRORMESSAGE"]);
  const fault = extractBlocks(xml, ["Fault"])[0];
  if (!fault && !hvd) return undefined;
  const msg = fault
    ? (firstValue(fault, ["faultstring", "Text", "Reason", "faultcode"]) ?? "SOAP Fault")
    : hvd;
  return (msg ?? "SOAP Fault").slice(0, 200);
}

// ---------------------------------------------------------------------------
// Parsing risposte
// ---------------------------------------------------------------------------

/** Candidati da SUCHEFIRMARESPONSE: FNR + denominazione, match per blocco,
 *  con fallback sulle coppie di tag nell'ordine del documento. */
export function parseFirmen(xml: string): AtFirm[] {
  const out: AtFirm[] = [];
  const seen = new Set<string>();
  const push = (fnr: string | undefined, name: string | undefined, seat?: string) => {
    if (!fnr || !name || seen.has(fnr)) return;
    seen.add(fnr);
    out.push({ fnr, name, ...(seat ? { seat } : {}) });
  };

  const blocks = extractBlocks(xml, ["FIRMA", "FIRMEN", "TREFFER", "SUCHERGEBNIS", "ERGEBNIS"]);
  for (const block of blocks) {
    push(
      firstValue(block, ["FNR", "FIRMENBUCHNUMMER"]),
      firstValue(block, ["FIRMENWORTLAUT", "FIRMAWORTLAUT", "NAME", "BEZEICHNUNG"]),
      firstValue(block, ["SITZ"]),
    );
  }
  if (out.length > 0) return out;

  const fnrs = tagValues(xml, "FNR");
  const names = tagValues(xml, "FIRMENWORTLAUT");
  for (let i = 0; i < Math.min(fnrs.length, names.length); i++) push(fnrs[i], names[i]);
  return out;
}

/** Il FNR vincente: match esatto normalizzato, altrimenti il primo candidato. */
function pickFirm(firms: AtFirm[], query: string): AtFirm | undefined {
  if (firms.length === 0) return undefined;
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  const q = norm(query);
  return firms.find((f) => f.name && norm(f.name) === q) ?? firms[0];
}

/** Classifica l'atto a partire da tutti i suoi campi testuali. */
export function classifyUrkunde(text: string): FinancialDocumentSummary["kind"] {
  const t = text.toLowerCase();
  if (/prüfungsbericht|bestätigungsvermerk|abschlussprüfer|revisionsbericht/.test(t))
    return "AUDIT_REPORT";
  if (/(konzern)?jahresabschluss|jahresfinanzbericht|halbjahresfinanzbericht|\besef\b/.test(t))
    return "ANNUAL_REPORT";
  if (/bilanz|eröffnungsbilanz|schlussbilanz|liquidations/.test(t)) return "BALANCE_SHEET";
  return "OTHER";
}

/** Atti da SUCHEURKUNDERESPONSE. Senza blocco noto non si inventa nulla. */
export function parseUrkunden(xml: string, fnr: string): AtUrkunde[] {
  const blocks = extractBlocks(xml, [
    "URKUNDE",
    "URKUNDENEINTRAG",
    "URKUNDENEINTRAGUNG",
    "DOKUMENT",
  ]);
  const out: AtUrkunde[] = [];
  let index = 0;
  for (const block of blocks) {
    const title =
      firstValue(block, [
        "URKUNDENART",
        "URKUNDEART",
        "URKUNDENTEXT",
        "TITEL",
        "BEZEICHNUNG",
        "ART",
      ]) ?? "Atto depositato";
    const date = firstValue(block, [
      "EINREICHUNGSDATUM",
      "ERLEDIGUNGSDATUM",
      "AUFNAHMEDATUM",
      "DATUM",
      "STICHTAG",
    ]);
    const urlRaw = firstValue(block, ["DOKUMENTURL", "DOWNLOADURL", "URL", "LINK"]);
    const url = urlRaw && /^https:\/\//.test(urlRaw) ? urlRaw : undefined;
    const yearMatch = (date ?? block).match(/(19|20)\d{2}/);
    const flat = block.replace(/<[^>]+>/g, " ");
    out.push({
      id: url ?? `${fnr}::${index++}`,
      kind: classifyUrkunde(flat),
      format: url
        ? /\.pdf(\?|$)/i.test(url)
          ? "pdf"
          : /\.(xbrl|zip)(\?|$)/i.test(url)
            ? "xbrl"
            : /\.xml(\?|$)/i.test(url)
              ? "xml"
              : "unknown"
        : "unknown",
      title,
      ...(yearMatch ? { year: Number(yearMatch[0]) } : {}),
      ...(date ? { date } : {}),
      ...(url ? { url } : {}),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Trasporto
// ---------------------------------------------------------------------------

async function soapCall(
  envelope: string,
  apiKey: string,
  timeoutMs: number,
): Promise<{ xml?: string; error?: string; status?: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/soap+xml;charset=UTF-8",
        SOAPAction: "",
        "X-Api-Key": apiKey,
      },
      body: envelope,
      signal: ctrl.signal,
    });
    const xml = await res.text();
    if (res.status === 401 || res.status === 403) {
      return { error: "chiave JustizOnline non valida o scaduta (HTTP " + res.status + ")" };
    }
    if (res.status === 429) {
      return { error: "JustizOnline: rate limit raggiunto, riprova tra poco", status: 429 };
    }
    if (!res.ok) return { error: `JustizOnline HTTP ${res.status}`, status: res.status };
    const fault = soapError(xml);
    if (fault) return { error: `JustizOnline: ${fault}`, status: res.status };
    return { xml, status: res.status };
  } catch (e) {
    const err = e as { name?: string | undefined; message?: string | undefined };
    return {
      error:
        err?.name === "AbortError"
          ? "JustizOnline: timeout"
          : (err?.message ?? "JustizOnline: errore di rete"),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Entry point: elenco bilanci depositati (Jahresabschlüsse) per società
// ---------------------------------------------------------------------------

/**
 * Con `apiKey` assente si restituisce `skipped` con le istruzioni per
 * richiedere la chiave gratuita (pattern identico al CBSO belga): la pagina
 * gratuita di fallback la gestisce official-pages.ts.
 */
export async function fetchAtFirmenbuchBilanci(
  query: string,
  apiKey: string | undefined,
  timeoutMs = 15000,
): Promise<AtResult> {
  const key = apiKey?.trim();
  if (!key) {
    return {
      ok: false,
      skipped:
        "chiave gratuita JustizOnline (HVD) mancante: richiedila su justizonline.gv.at/jop/web/iwg/register e configura AT_JUSTIZONLINE_API_KEY",
    };
  }

  const directFn = fnFromInput(query);
  let fnr = directFn;
  let firmName = query.trim();

  if (!fnr) {
    if (!firmName) {
      return {
        ok: false,
        skipped:
          "servi la ragione sociale (Firmenwortlaut) oppure la Firmenbuchnummer nel formato “FN 123456a”: l'IVA austriaca (ATU…) non la contiene",
      };
    }
    const search = await soapCall(buildSucheFirmaEnvelope(firmName), key, timeoutMs);
    if (!search.xml) return { ok: false, error: search.error };
    const firms = parseFirmen(search.xml);
    const firm = pickFirm(firms, firmName);
    if (!firm) {
      return { ok: false, error: `nessuna società nel Firmenbuch per “${firmName}”` };
    }
    fnr = firm.fnr;
    firmName = firm.name;
  }

  const docs = await soapCall(buildSucheUrkundeEnvelope(fnr), key, timeoutMs);
  if (!docs.xml) return { ok: false, error: docs.error };

  const urkunden = parseUrkunden(docs.xml, fnr);
  const bilanci = urkunden.filter((u) => u.kind === "ANNUAL_REPORT" || u.kind === "BALANCE_SHEET");
  const pool = bilanci.length > 0 ? bilanci : urkunden;

  if (pool.length === 0) {
    return {
      ok: false,
      error: `nessun atto depositato elencato per ${firmName} (FN ${fnr})`,
    };
  }

  const documents: FinancialDocumentSummary[] = pool.map((u) => ({
    id: u.id,
    ...(u.year ? { year: u.year } : {}),
    kind: u.kind,
    format: u.format,
    availability: u.url ? "DOCUMENT_DOWNLOADABLE" : "DOCUMENT_FOUND",
    title: u.title,
    ...(u.url
      ? { downloadUrl: `/api/company-finder/document?url=${encodeURIComponent(u.url)}` }
      : { restriction: "SOURCE_RESTRICTION" as const }),
  }));

  const annual = pool
    .filter((u) => u.kind === "ANNUAL_REPORT" || u.kind === "BALANCE_SHEET")
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const years: FinancialYear[] = annual.map((u) => ({
    periodLabel: u.year ? `Deposito ${u.year}` : "Deposito non datato",
    ...(u.year ? { year: u.year } : {}),
    currency: "EUR",
  }));

  const data: Financials = {
    available: true,
    years,
    source: `JustizOnline HVD — Firmenbuch austriaco (BMJ), FN ${fnr}`,
    availability: pool.some((u) => u.url) ? "DOCUMENT_DOWNLOADABLE" : "DOCUMENT_FOUND",
    documents,
    note:
      `${firmName}: ${pool.length} atti individuati` +
      (bilanci.length > 0 ? `, di cui ${bilanci.length} bilanci` : "") +
      ". Fonte ufficiale HVD (reg. UE 2023/138), licenza CC-BY 4.0, aggiornamento giornaliero. " +
      "Il PDF del Jahresabschluss, senza account e con gli stessi dati, si scarica dalla pagina gratuita indicata sotto.",
  };
  return { ok: true, data };
}
