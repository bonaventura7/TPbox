// ---------- Regno Unito: Companies House, sito pubblico (senza chiave) ----------
// L'API di Companies House richiede una chiave per i conti annuali. Il SITO
// pubblico no: è servito lato server, senza sessione e senza sfida anti-bot, e
// contiene tutto quello che serve.
//
//   1. /search/companies?q=<nome>            → numero società
//   2. /company/<n>/filing-history?category=accounts → riga dei conti annuali
//   3. /company/<n>/filing-history/<id>/document?format=pdf → il PDF depositato
//
// Il PDF viene poi servito in pagina dal proxy del tool: l'utente non esce dal
// sito. Verificato da IP datacenter, senza credenziali.

import { getCountry } from "../../countries";
import type { CompanyProfile, Financials } from "../../types";

const HOST = "https://find-and-update.company-information.service.gov.uk";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface UkPublicResult {
  ok: boolean;
  profile?: CompanyProfile | undefined;
  financials?: Financials | undefined;
  error?: string | undefined;
}

/** Numero Companies House: 8 cifre, oppure 2 lettere + 6 cifre (SC…, NI…). */
export function ukNumberFromInput(value: string): string | undefined {
  const compact = value.replace(/\s/g, "").toUpperCase();
  return /^([0-9]{8}|[A-Z]{2}[0-9]{6})$/.test(compact) ? compact : undefined;
}

function decode(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function get(url: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    signal,
  });
  if (!res.ok) throw new Error(`Companies House HTTP ${res.status}`);
  return res.text();
}

/** Primo risultato della ricerca per nome: numero + denominazione. */
function firstSearchHit(html: string): { number: string; name: string } | undefined {
  const match = html.match(/href="\/company\/([A-Z0-9]{6,10})"[^>]*>([\s\S]{0,200}?)<\/a>/i);
  if (!match) return undefined;
  const number = match[1];
  const name = decode(match[2] ?? "");
  if (!number || !name) return undefined;
  return { number, name };
}

/** Riga dei conti annuali: link al documento + descrizione + data. */
function firstAccountsDocument(
  html: string,
): { documentPath: string; description: string } | undefined {
  const linkRe =
    /href="(\/company\/[A-Z0-9]{6,10}\/filing-history\/[^"]+?\/document\?format=pdf[^"]*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const path = match[1];
    if (!path) continue;
    // La descrizione della pubblicazione precede il link nella stessa riga di
    // tabella: si prende il testo dei 1.200 caratteri che stanno prima.
    const before = html.slice(Math.max(0, match.index - 1200), match.index);
    const text = decode(before);
    if (/accounts/i.test(text)) {
      const described = text.match(/([^.]*accounts[^.]{0,90})/i);
      return {
        documentPath: path.replace(/&amp;/g, "&"),
        description: described ? described[1]!.trim() : "Annual accounts",
      };
    }
  }
  return undefined;
}

/** Scheda societaria dalla pagina /company/<n>. */
function profileFrom(html: string, number: string, fallbackName: string): CompanyProfile {
  const nameMatch = html.match(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/i);
  const statusMatch = html.match(/id="company-status"[^>]*>([\s\S]{0,80}?)</i);
  const typeMatch = html.match(/id="company-type"[^>]*>([\s\S]{0,80}?)</i);
  const addressMatch = html.match(/id="reg-address-value"[^>]*>([\s\S]{0,240}?)</i);
  const incorporatedMatch = html.match(/id="company-creation-date"[^>]*>([\s\S]{0,60}?)</i);

  const profile: CompanyProfile = {
    name: nameMatch ? decode(nameMatch[1] ?? "") || fallbackName : fallbackName,
    nameSource: "Companies House",
    country: getCountry("UK")!,
    registry: { name: "Companies House", authority: "UK Government", id: `Company No. ${number}` },
    identifiers: [{ key: "Company No.", value: number }],
  };
  if (statusMatch) profile.status = decode(statusMatch[1] ?? "").toLowerCase();
  if (typeMatch) profile.legalForm = decode(typeMatch[1] ?? "");
  if (addressMatch) profile.address = decode(addressMatch[1] ?? "").toLowerCase();
  if (incorporatedMatch) profile.registeredSince = decode(incorporatedMatch[1] ?? "");
  return profile;
}

export async function lookupUkPublic(
  query: string,
  localVat: string,
  timeoutMs = 18000,
): Promise<UkPublicResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // 1. numero società: digitato, oppure dal primo risultato della ricerca
    let number = ukNumberFromInput(localVat);
    let name = query.trim();
    if (!number) {
      if (name.length < 3) {
        return { ok: false, error: "serve la ragione sociale o il Company Number" };
      }
      const searchHtml = await get(
        `${HOST}/search/companies?q=${encodeURIComponent(name)}`,
        ctrl.signal,
      );
      const hit = firstSearchHit(searchHtml);
      if (!hit) return { ok: false, error: "nessuna società UK corrisponde alla denominazione" };
      number = hit.number;
      name = hit.name;
    }

    // 2. scheda + 3. conti annuali depositati, in parallelo
    const [companyHtml, filingHtml] = await Promise.all([
      get(`${HOST}/company/${number}`, ctrl.signal),
      get(`${HOST}/company/${number}/filing-history?category=accounts`, ctrl.signal),
    ]);

    const profile = profileFrom(companyHtml, number, name);
    const document = firstAccountsDocument(filingHtml);
    if (!document) {
      return {
        ok: true,
        profile,
        financials: {
          available: false,
          years: [],
          source: "Companies House — cronologia depositi",
          note: "Nessun deposito di conti annuali risulta nella cronologia pubblica della società.",
        },
      };
    }

    const proxied = `/api/company-finder/document?url=${encodeURIComponent(HOST + document.documentPath)}`;
    return {
      ok: true,
      profile,
      financials: {
        available: true,
        years: [],
        source: "Companies House — conti annuali depositati",
        documentUrl: proxied,
        documentTitle: document.description,
        note: "Documento depositato presso Companies House, pubblico e gratuito, servito in pagina dal server dell'Osservatorio.",
      },
    };
  } catch (e) {
    const err = e as { name?: string | undefined; message?: string | undefined };
    return {
      ok: false,
      error:
        err?.name === "AbortError"
          ? "Companies House: timeout"
          : (err?.message ?? "Companies House: errore di rete"),
    };
  } finally {
    clearTimeout(timer);
  }
}
