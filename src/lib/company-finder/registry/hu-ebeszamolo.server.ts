// ---------- Ungheria: e-Beszámoló (Igazságügyi Minisztérium) ----------
// Registro ufficiale dei bilanci depositati: https://e-beszamolo.im.gov.hu
//
// Contratto misurato sul portale reale (settembre 2026):
//  · la ricerca è una POST multipart a /Search/Results con UNO tra
//    firmNumber (NN-NN-NNNNNN), firmTaxNumber (prime 8 cifre dell'adószám) e
//    firmName (minimo 4 caratteri);
//  · ogni ricerca è protetta da un widget anti-bot ALTCHA (proof-of-work) e da
//    una modale di accettazione delle condizioni d'uso;
//  · la pagina di risultato usa parametri opachi (b, so, o) legati alla
//    sessione ASP.NET: riusati fuori sessione rispondono «Hibás paraméterek!»;
//  · le risposte portano X-Frame-Options: DENY, quindi la pagina non è
//    incorporabile in un iframe.
//
// Conseguenza: il download server-side NON è possibile senza aggirare ALTCHA,
// cosa che questo adapter non fa. Lo stato dichiarato è REGISTRY_ONLY con
// restrizione CAPTCHA_REQUIRED, e l'utente riceve le istruzioni per scaricare
// il documento dal proprio browser. Nessun parametro b/so/o è hardcodato.

import type {
  AdapterContext,
  AdapterResult,
  CompanyMatch,
  FinancialDocumentRef,
  RegistryAdapter,
  RestrictionCode,
} from "./types";
import { restrictionMessage } from "./types";
import type { CompanyProfile } from "../types";
import { getCountry } from "../countries";
import type { HuIdentifiers } from "./hu-identifiers";
import { normalizeHuIdentifiers } from "./hu-identifiers";

export type { HuIdentifiers };
export { normalizeHuIdentifiers };

export const EBESZAMOLO_BASE = "https://e-beszamolo.im.gov.hu";
export const EBESZAMOLO_SEARCH_PAGE = `${EBESZAMOLO_BASE}/oldal/beszamolo_kereses`;

const PROBE_TIMEOUT_MS = 8_000;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type EbeszamoloPageKind = "CAPTCHA_REQUIRED" | "SESSION_BOUND" | "RESULTS" | "UNKNOWN";

/** Classifica una pagina del portale senza tentare di superarne i controlli. */
export function classifyEbeszamoloPage(html: string): EbeszamoloPageKind {
  const lower = html.toLowerCase();
  if (lower.includes("hibás paraméterek") || lower.includes("hib&#225;s param&#233;terek")) {
    return "SESSION_BOUND";
  }
  if (lower.includes("altcha-widget") || lower.includes("recaptcha") || lower.includes("captcha")) {
    return "CAPTCHA_REQUIRED";
  }
  if (lower.includes("kereses_megjelenites") || lower.includes("beszámoló letöltése")) {
    return "RESULTS";
  }
  return "UNKNOWN";
}

function restricted<T>(code: RestrictionCode, retryable = false): AdapterResult<T> {
  return { ok: false, restriction: code, message: restrictionMessage(code), retryable };
}

/**
 * Sonda di capacità: UNA sola GET alla pagina di ricerca, per accertare se il
 * controllo anti-bot è ancora presente. Nessuna POST di ricerca viene inviata
 * finché la restrizione è attiva.
 */
export async function probeEbeszamolo(ctx: AdapterContext): Promise<EbeszamoloPageKind> {
  const doFetch = ctx.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await doFetch(EBESZAMOLO_SEARCH_PAGE, {
      method: "GET",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: ctx.signal ?? controller.signal,
    });
    if (!response.ok) return "UNKNOWN";
    return classifyEbeszamoloPage(await response.text());
  } catch {
    return "UNKNOWN";
  } finally {
    clearTimeout(timer);
  }
}

function probeToRestriction(kind: EbeszamoloPageKind): RestrictionCode {
  if (kind === "CAPTCHA_REQUIRED") return "CAPTCHA_REQUIRED";
  if (kind === "SESSION_BOUND") return "SESSION_BOUND";
  if (kind === "RESULTS") return "SOURCE_RESTRICTION";
  return "SOURCE_UNAVAILABLE";
}

export const huAdapter: RegistryAdapter<HuIdentifiers> = {
  iso: "HU",
  registryLabel: "e-Beszámoló — Igazságügyi Minisztérium",
  registryUrl: EBESZAMOLO_SEARCH_PAGE,

  normalizeIdentifiers: normalizeHuIdentifiers,

  async searchCompanies(ids, ctx): Promise<AdapterResult<CompanyMatch[]>> {
    if (!ids.cegjegyzekszam && !ids.adoszam8 && !ids.name) {
      return restricted<CompanyMatch[]>("SOURCE_RESTRICTION");
    }
    const kind = await probeEbeszamolo(ctx);
    return restricted<CompanyMatch[]>(probeToRestriction(kind), kind === "UNKNOWN");
  },

  async getCompany(ids, ctx): Promise<AdapterResult<CompanyProfile>> {
    const kind = await probeEbeszamolo(ctx);
    const country = getCountry("HU");
    if (kind === "RESULTS" && country) {
      // Il portale non espone dati anagrafici strutturati: si restituisce solo
      // ciò che l'utente ha fornito, senza inventare campi.
      return {
        ok: true,
        data: {
          name: ids.name,
          country,
          registry: {
            name: huAdapter.registryLabel,
            authority: country.registryAuthority,
            ...((ids.cegjegyzekszam ?? ids.adoszam8)
              ? { id: ids.cegjegyzekszam ?? ids.adoszam8! }
              : {}),
          },
        },
      };
    }
    return restricted<CompanyProfile>(probeToRestriction(kind), kind === "UNKNOWN");
  },

  async listFinancialDocuments(ids, ctx): Promise<AdapterResult<FinancialDocumentRef[]>> {
    if (!ids.cegjegyzekszam && !ids.adoszam8 && !ids.name) {
      return restricted<FinancialDocumentRef[]>("SOURCE_RESTRICTION");
    }
    const kind = await probeEbeszamolo(ctx);
    // Anche con la pagina risultato raggiungibile, i riferimenti del portale
    // sono legati alla sessione: nessun documento viene dichiarato trovato.
    return restricted<FinancialDocumentRef[]>(probeToRestriction(kind), kind === "UNKNOWN");
  },

  async acquireDocument(ref) {
    if (!ref.sourceRef || ref.availability !== "DOCUMENT_DOWNLOADABLE") {
      return restricted("SESSION_BOUND");
    }
    // Ramo raggiungibile solo se il registro esporrà un canale senza controllo
    // anti-bot: in quel caso il download passa dal resolver interno condiviso.
    const { acquireFromSource } = await import("../document-resolver.server");
    return acquireFromSource(ref.sourceRef, { correlationId: ctx0(ref) });
  },
};

function ctx0(ref: { id: string }): string {
  return `hu-${ref.id}`;
}
