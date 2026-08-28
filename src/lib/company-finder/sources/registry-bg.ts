// ---------- Търговски регистър — Bulgaria: Agenzia sulle Iscrizioni ----------
// Portale pubblico dell'Agenzia (Registry Agency), HTML server-side.
//   GET https://portal.registryagency.bg/en/search?sKey={query}
//
// Il motore di ricerca risponde alla ragione sociale esatta o all'EIK
// (Unified Identification Code, 9 cifre). L'HTML dei risultati è
// server-rendered: questo adapter estrae nome ed EIK dai link alle
// schede-impresa. Best-effort: la verifica in produzione richiede un
// nome registrato esatto.

import type { CompanyProfile, Identifier } from "../types";
import { getCountry } from "../countries";

export interface BgResult {
  ok: boolean;
  data?: CompanyProfile | undefined;
  error?: string | undefined;
  note?: string | undefined;
}

const BASE = "https://portal.registryagency.bg/en/search";

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchBg(query: string, timeoutMs = 15000): Promise<BgResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `${BASE}?sKey=${encodeURIComponent(query.trim())}`;
    const res = await fetch(url, {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `Registro BG HTTP ${res.status}` };
    const html = await res.text();

    const countMatch = html.match(/The <b>(\d+)<\/b> results? found/i);
    const countRaw = countMatch?.[1];
    const count = countRaw !== undefined ? parseInt(countRaw, 10) : NaN;
    if (count === 0) {
      return { ok: true, note: "nessuna corrispondenza (serve il nome registrato esatto o l'EIK)" };
    }

    // Riga di risultato: link alla scheda-impresa con il nome come testo.
    const rows = Array.from(
      html.matchAll(/<a[^>]+href="([^"]*entity[^"]*)"[^>]*>([\s\S]{3,200}?)<\/a>/gi),
    );
    let name: string | undefined;
    let entityUrl: string | undefined;
    for (const [, href, inner] of rows) {
      const text = stripTags(inner ?? "");
      if (!text || /^\d+$/.test(text)) continue;
      if (!name) {
        name = text;
        entityUrl = href;
      }
    }
    if (!name) {
      // struttura inattesa: prova il primo titolo h2/h3
      const h = html.match(/<h[23][^>]*>([\s\S]{3,160}?)<\/h[23]>/i);
      const hInner = h?.[1];
      if (hInner !== undefined) name = stripTags(hInner);
    }
    if (!name)
      return {
        ok: false,
        error: "Registro BG: risultati non analizzabili (struttura pagina inattesa)",
      };

    const eik = html.match(/\b(\d{9})\b/)?.[1];

    const identifiers: Identifier[] = [];
    if (eik) identifiers.push({ key: "EIK (Unique Identification Code)", value: eik });

    const profile: CompanyProfile = {
      name,
      nameSource: "Търговски регистър (Registry Agency)",
      country: getCountry("BG")!,
      registry: {
        name: "Търговски регистър (Registro Commerciale)",
        authority: "Агенция по вписванията (Registry Agency)",
        // exactOptionalPropertyTypes: id omesso quando l'EIK non è stato trovato.
        ...(eik ? { id: `EIK ${eik}` } : {}),
      },
      identifiers: identifiers.length ? identifiers : undefined,
    };
    void entityUrl;
    return { ok: true, data: profile };
  } catch (e) {
    const err = e as
      | { name?: string | undefined; message?: string | undefined; cause?: { code?: string } }
      | undefined;
    const code = err?.cause?.code;
    const msg =
      err?.name === "AbortError"
        ? "timeout"
        : code === "ENOTFOUND"
          ? "dominio non risolto (DNS)"
          : (err?.message ?? "errore");
    return { ok: false, error: `Registro BG: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
