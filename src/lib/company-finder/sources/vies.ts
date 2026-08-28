// ---------- VIES — Commissione Europea: validazione IVS/VAT (SOAP) ----------
// Fonte ufficiale UE, gratuita, senza chiave.
// Endpoint: https://ec.europa.eu/taxation_customs/vies/services/checkVatService

import type { VatInfo } from "../types";

const ENDPOINT = "https://ec.europa.eu/taxation_customs/vies/services/checkVatService";
const NS = "urn:ec.europa.eu:taxud:vies:services:checkVat:types";

function buildEnvelope(country: string, vatNumber: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:types="${NS}">` +
    `<soapenv:Body>` +
    `<types:checkVat>` +
    `<types:countryCode>${country}</types:countryCode>` +
    `<types:vatNumber>${vatNumber}</types:vatNumber>` +
    `</types:checkVat>` +
    `</soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

function xmlTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<ns2:${tag}[^>]*>([^<]*)</ns2:${tag}>`));
  const captured = m?.[1];
  return captured !== undefined ? captured.trim() : null;
}

export interface ViesResult {
  ok: boolean;
  data?: (VatInfo & { name?: string | undefined; address?: string | undefined }) | undefined;
  error?: string | undefined;
}

/**
 * Convalida un numero di IVA intracomunitario.
 * @param country ISO2 (codice VIES: per la Grecia "EL")
 * @param vatNumber numero senza prefisso paese
 */
export async function checkVat(
  country: string,
  vatNumber: string,
  timeoutMs = 15000,
): Promise<ViesResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    let xml: string | null = null;
    let busy = false;
    // VIES in fase di carico/limitazione risponde con un payload di
    // "status" invece del risultato: si aspetta e si riprova una volta.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(2500);
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "User-Agent": "Mozilla/5.0 (compatible; TPbox-CompanyFinder/1.0)",
        },
        body: buildEnvelope(country, vatNumber),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        return { ok: false, error: `VIES HTTP ${res.status}` };
      }
      xml = await res.text();
      busy = !xml.includes("checkVatResponse");
      if (!busy) break;
    }
    if (!xml || busy) {
      return { ok: false, error: "VIES: servizio momentaneamente in carico (riprova tra poco)" };
    }
    const valid = xmlTag(xml, "valid");
    const data = {
      number: `${country}${vatNumber}`,
      country: (xmlTag(xml, "countryCode") || country).toUpperCase(),
      valid: valid === "true",
      checkedAt: xmlTag(xml, "requestDate") || undefined,
      name: xmlTag(xml, "name") && xmlTag(xml, "name") !== "---" ? xmlTag(xml, "name")! : undefined,
      address:
        xmlTag(xml, "address") && xmlTag(xml, "address") !== "---"
          ? xmlTag(xml, "address")!
          : undefined,
    };
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "VIES: errore di rete",
    };
  } finally {
    clearTimeout(timer);
  }
}
