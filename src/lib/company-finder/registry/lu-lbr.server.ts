// ---------- Lussemburgo: LBR — Registre de Commerce et des Sociétés ----------
// Registro ufficiale delle imprese e dei bilanci depositati: https://www.lbr.lu
//
// Contratto misurato sul portale reale e sulle sue condizioni d'uso
// (settembre 2026):
//  · la ricerca per denominazione o numero RCS è gratuita e pubblica;
//  · i conti annuali (comptes annuels) sono depositati e consultabili, ma il
//    loro DOWNLOAD richiede un account gratuito (LuxTrust / eIDAS) e i termini
//    d'uso del portale vietano lo scarico automatizzato massivo: l'unico canale
//    programmatico sanzionato è l'API open data a pagamento, per grandi volumi;
//  · non esiste quindi un canale server-side gratuito per il documento.
//
// Conseguenza: come per HU, il download server-side NON è realizzabile senza
// aggirare un controllo del registro (qui l'autenticazione), cosa che questo
// adapter non fa. Lo stato dichiarato è REGISTRY_ONLY con restrizione
// AUTH_REQUIRED, e l'utente riceve le istruzioni per consultare e scaricare il
// documento dal proprio browser sul portale ufficiale.

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
import type { LuIdentifiers } from "./lu-identifiers";
import { normalizeLuIdentifiers } from "./lu-identifiers";

export type { LuIdentifiers };
export { normalizeLuIdentifiers };

export const LBR_BASE = "https://www.lbr.lu";
export const LBR_SEARCH_PAGE = `${LBR_BASE}/mjrcs-web-front/`;

const PROBE_TIMEOUT_MS = 8_000;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type LbrPageKind = "AUTH_REQUIRED" | "RESULTS" | "UNKNOWN";

/** Classifica una pagina del portale senza tentare di superarne i controlli. */
export function classifyLbrPage(html: string): LbrPageKind {
  const lower = html.toLowerCase();
  // Il download dei documenti passa sempre dall'autenticazione: la presenza di
  // un invito al login o della menzione del requisito d'account è sufficiente a
  // dichiarare la restrizione, senza tentare alcun accesso.
  if (
    lower.includes("luxtrust") ||
    lower.includes("se connecter") ||
    lower.includes("/login") ||
    lower.includes("nécessite un compte") ||
    lower.includes("necessite un compte") ||
    lower.includes("requires an account")
  ) {
    return "AUTH_REQUIRED";
  }
  // La lista risultati/consultazione contiene i comandi di deposito.
  if (
    lower.includes("consult-company") ||
    lower.includes("comptes annuels") ||
    lower.includes("liste des dépôts") ||
    lower.includes("liste des depots")
  ) {
    return "RESULTS";
  }
  return "UNKNOWN";
}

function restricted<T>(code: RestrictionCode, retryable = false): AdapterResult<T> {
  return { ok: false, restriction: code, message: restrictionMessage(code), retryable };
}

/**
 * Sonda di capacità: UNA sola GET alla pagina di ricerca, per accertare se il
 * download è ancora vincolato all'autenticazione. Nessuna ricerca autenticata
 * viene tentata finché la restrizione è attiva.
 */
export async function probeLbr(ctx: AdapterContext): Promise<LbrPageKind> {
  const doFetch = ctx.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await doFetch(LBR_SEARCH_PAGE, {
      method: "GET",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: ctx.signal ?? controller.signal,
    });
    if (!response.ok) return "UNKNOWN";
    return classifyLbrPage(await response.text());
  } catch {
    return "UNKNOWN";
  } finally {
    clearTimeout(timer);
  }
}

function probeToRestriction(kind: LbrPageKind): RestrictionCode {
  if (kind === "AUTH_REQUIRED") return "AUTH_REQUIRED";
  // Anche con la pagina di consultazione raggiungibile, il documento resta
  // dietro autenticazione: si dichiara comunque il vincolo d'accesso.
  if (kind === "RESULTS") return "AUTH_REQUIRED";
  return "SOURCE_UNAVAILABLE";
}

export const luAdapter: RegistryAdapter<LuIdentifiers> = {
  iso: "LU",
  registryLabel: "LBR — Luxembourg Business Registers",
  registryUrl: LBR_SEARCH_PAGE,

  normalizeIdentifiers: normalizeLuIdentifiers,

  async searchCompanies(ids, ctx): Promise<AdapterResult<CompanyMatch[]>> {
    if (!ids.rcs && !ids.name) {
      return restricted<CompanyMatch[]>("SOURCE_RESTRICTION");
    }
    const kind = await probeLbr(ctx);
    return restricted<CompanyMatch[]>(probeToRestriction(kind), kind === "UNKNOWN");
  },

  async getCompany(ids, ctx): Promise<AdapterResult<CompanyProfile>> {
    const kind = await probeLbr(ctx);
    const country = getCountry("LU");
    if (kind === "RESULTS" && country) {
      // Il portale non espone dati anagrafici strutturati senza autenticazione:
      // si restituisce solo ciò che l'utente ha fornito, senza inventare campi.
      return {
        ok: true,
        data: {
          name: ids.name,
          country,
          registry: {
            name: luAdapter.registryLabel,
            authority: country.registryAuthority,
            ...(ids.rcs ? { id: ids.rcs } : {}),
          },
        },
      };
    }
    return restricted<CompanyProfile>(probeToRestriction(kind), kind === "UNKNOWN");
  },

  async listFinancialDocuments(ids, ctx): Promise<AdapterResult<FinancialDocumentRef[]>> {
    if (!ids.rcs && !ids.name) {
      return restricted<FinancialDocumentRef[]>("SOURCE_RESTRICTION");
    }
    const kind = await probeLbr(ctx);
    // Il download dei conti annuali richiede sempre l'autenticazione: nessun
    // documento viene dichiarato scaricabile lato server.
    return restricted<FinancialDocumentRef[]>(probeToRestriction(kind), kind === "UNKNOWN");
  },

  async acquireDocument(ref, ctx) {
    if (!ref.sourceRef || ref.availability !== "DOCUMENT_DOWNLOADABLE") {
      return restricted("SESSION_BOUND");
    }
    // Ramo raggiungibile solo se il registro esporrà un canale senza
    // autenticazione: in quel caso il download passa dal resolver interno
    // condiviso, con la stessa allowlist e lo stesso hardening degli altri paesi.
    const { acquireFromSource } = await import("../document-resolver.server");
    return acquireFromSource(ref.sourceRef, { correlationId: `lu-${ref.id}` });
  },
};
