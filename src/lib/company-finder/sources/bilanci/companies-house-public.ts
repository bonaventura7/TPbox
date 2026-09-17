// ---------- Regno Unito: Companies House, sito pubblico (senza chiave) ----------
// L'API di Companies House richiede una chiave per i conti annuali. Il SITO
// pubblico no: è servito lato server, senza sessione e senza sfida anti-bot, e
// contiene tutto quello che serve.
//
//   1. /search/companies?q=<nome>            → numero società
//   2. /company/<n>/filing-history?category=accounts → riga dei conti annuali
//   3. /company/<n>/filing-history/<id>/document?format=pdf → il PDF depositato
//
// L'adapter espone l'URL ufficiale; l'incapsulamento nel proxy avviene una sola
// volta a valle, prima di restituire la risposta al client.
//
// Il company number e' di 8 caratteri (cifre, o due lettere piu' sei cifre per
// Scozia e Irlanda del Nord) e NON e' la partita IVA britannica: si normalizza
// in `ukNumberFromInput`.
//
// Nessun controllo viene aggirato: le pagine sono servite lato server, senza
// login e senza sfida anti-bot. Si sceglie il sito pubblico invece dell'API
// proprio per non dipendere da una chiave, non per eludere un limite.

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

function firstSearchHit(html: string): { number: string; name: string } | undefined {
  const match = html.match(/href="\/company\/([A-Z0-9]{6,10})"[^>]*>([\s\S]{0,200}?)<\/a>/i);
  if (!match) return undefined;
  const number = match[1];
  const name = decode(match[2] ?? "");
  if (!number || !name) return undefined;
  return { number, name };
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Data di chiusura dell'esercizio, dalla dicitura "made up to 31 December 2025".
 * Serve a ORDINARE i depositi: l'ordine di pagina non e' affidabile, e fidarsene
 * e' il motivo per cui il tool mostrava un bilancio 2017 su una societa' che ha
 * i conti fino al 2025.
 */
function madeUpToTime(text: string): number | undefined {
  const m = text.match(/made up to\s+(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/i);
  if (!m) return undefined;
  const month = MONTHS[m[2]!.toLowerCase()];
  if (month === undefined) return undefined;
  return Date.UTC(Number(m[3]), month, Number(m[1]));
}

interface AccountsRow {
  documentPath: string;
  description: string;
  interim: boolean;
  madeUpTo?: number | undefined;
}

function findAccountsRows(html: string): AccountsRow[] {
  const rows: AccountsRow[] = [];
  const linkRe =
    /href="(\/company\/[A-Z0-9]{6,10}\/filing-history\/[^"]+?\/document\?format=pdf[^"]*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const path = match[1];
    if (!path) continue;
    const window = html.slice(Math.max(0, match.index - 1500), match.index);
    const rowStart = window.lastIndexOf("<tr");
    const text = decode(rowStart === -1 ? window : window.slice(rowStart));
    // Misurato 2026-09-17 su Companies House: la dicitura corrente e'
    // "AA Accounts for a small company made up to 31 December 2025".
    // La vecchia regex pretendeva "accounts made up to" adiacenti, quindi
    // agganciava solo le diciture storiche ("Total exemption full accounts
    // made up to ...") e faceva vincere un deposito del 2017.
    const described = text.match(
      /([^.;<]*\baccounts\b[^.;<]{0,80}?made up to\s+\d{1,2}\s+\w+\s+\d{4})/i,
    );
    if (!described) continue;
    const description = described[1]!
      .replace(/^\d{1,2}\s+\w+\s+\d{4}\s*/, "")
      .replace(/^[A-Z]{2,6}\s+/, "")
      .trim();
    rows.push({
      documentPath: path.replace(/&amp;/g, "&"),
      description,
      interim: /interim/i.test(description),
      madeUpTo: madeUpToTime(description),
    });
  }
  return rows;
}

async function firstAccountsDocument(
  number: string,
  signal: AbortSignal,
): Promise<{ documentPath: string; description: string } | undefined> {
  // `category=accounts` e' quello che l'intestazione di questo file dichiara da
  // sempre; il codice non lo passava, quindi le pagine erano piene di depositi
  // di altro tipo e i conti veri finivano oltre la quarta pagina.
  const pages = await Promise.all(
    [1, 2, 3].map((page) =>
      get(
        `${HOST}/company/${number}/filing-history?category=accounts&page=${page}`,
        signal,
      ).catch(() => ""),
    ),
  );

  const seen = new Set<string>();
  const rows = pages
    .flatMap((html) => (html ? findAccountsRows(html) : []))
    .filter((row) => (seen.has(row.documentPath) ? false : (seen.add(row.documentPath), true)))
    // Il piu' recente per data di chiusura dell'esercizio, non per posizione.
    .sort((a, b) => (b.madeUpTo ?? 0) - (a.madeUpTo ?? 0));

  return rows.find((row) => !row.interim) ?? rows[0];
}

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

    const [companyHtml, document] = await Promise.all([
      get(`${HOST}/company/${number}`, ctrl.signal),
      firstAccountsDocument(number, ctrl.signal),
    ]);

    const profile = profileFrom(companyHtml, number, name);
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

    const documentUrl = HOST + document.documentPath;
    return {
      ok: true,
      profile,
      financials: {
        available: true,
        years: [],
        source: "Companies House — conti annuali depositati",
        documentUrl,
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
