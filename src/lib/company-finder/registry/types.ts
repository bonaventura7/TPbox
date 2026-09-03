// ---------- Contratto generico degli adapter di registro ----------
// HU (e-Beszámoló) è la prima implementazione. Il contratto separa in modo
// esplicito i tre stati che l'utente deve poter distinguere:
//
//   REGISTRY_ONLY          → il registro è consultabile, ma il documento non è
//                            ottenibile lato server (anti-bot, sessione, login)
//   DOCUMENT_FOUND         → il documento esiste e ne conosciamo il riferimento
//   DOCUMENT_DOWNLOADABLE  → il documento è scaricabile dal server e servito
//                            da un endpoint interno di TPBox
//
// Nessun adapter aggira CAPTCHA, WAF, autenticazione o altri controlli tecnici
// del registro: quando il controllo esiste, si dichiara la restrizione.

import type { CompanyProfile, DocumentAvailability, RestrictionCode } from "../types";

export type { DocumentAvailability, RestrictionCode };

export type DocumentKind = "ANNUAL_REPORT" | "BALANCE_SHEET" | "AUDIT_REPORT" | "OTHER";

export type DocumentFormat = "pdf" | "xbrl" | "xml" | "zip" | "html" | "unknown";

/** Riferimento alla fonte: resta SEMPRE lato server, mai nel payload al client. */
export interface DocumentSourceRef {
  url: string;
  registry: string;
  accept?: string | undefined;
}

export interface FinancialDocumentRef {
  id: string;
  year: number | undefined;
  kind: DocumentKind;
  format: DocumentFormat;
  availability: DocumentAvailability;
  restriction?: RestrictionCode | undefined;
  title?: string | undefined;
  /** Solo server: assente per definizione quando availability = REGISTRY_ONLY. */
  sourceRef?: DocumentSourceRef | undefined;
}

export interface AcquiredDocument {
  bytes: ArrayBuffer;
  contentType: string;
  size: number;
  sha256: string;
  provenance: {
    registry: string;
    fetchedAt: string;
    correlationId: string;
  };
}

export interface AdapterContext {
  fetchImpl?: typeof fetch | undefined;
  signal?: AbortSignal | undefined;
  correlationId?: string | undefined;
}

export type AdapterResult<T> =
  | { ok: true; data: T }
  | { ok: false; restriction: RestrictionCode; message: string; retryable: boolean };

export interface CompanyMatch {
  id: string;
  name: string;
  registryId?: string | undefined;
}

export interface RegistryAdapter<Identifiers> {
  iso: string;
  registryLabel: string;
  registryUrl: string;
  normalizeIdentifiers: (input: { vat?: string | undefined; query?: string | undefined }) => Identifiers;
  searchCompanies: (ids: Identifiers, ctx: AdapterContext) => Promise<AdapterResult<CompanyMatch[]>>;
  getCompany: (ids: Identifiers, ctx: AdapterContext) => Promise<AdapterResult<CompanyProfile>>;
  listFinancialDocuments: (
    ids: Identifiers,
    ctx: AdapterContext,
  ) => Promise<AdapterResult<FinancialDocumentRef[]>>;
  acquireDocument: (
    ref: FinancialDocumentRef,
    ctx: AdapterContext,
  ) => Promise<AdapterResult<AcquiredDocument>>;
}

export function restrictionMessage(code: RestrictionCode): string {
  switch (code) {
    case "CAPTCHA_REQUIRED":
      return "Il registro protegge la ricerca con una verifica anti-bot: il documento va scaricato dal browser dell'utente.";
    case "AUTH_REQUIRED":
      return "Il registro richiede autenticazione per accedere al documento.";
    case "SESSION_BOUND":
      return "I riferimenti del registro sono legati alla sessione dell'utente e non sono riutilizzabili da un server.";
    case "RATE_LIMITED":
      return "Il registro ha limitato temporaneamente le richieste.";
    case "SOURCE_UNAVAILABLE":
      return "La fonte ufficiale non è momentaneamente raggiungibile.";
    case "INVALID_DOCUMENT":
      return "Il contenuto restituito dalla fonte non è un documento di bilancio valido.";
    case "SOURCE_RESTRICTION":
    default:
      return "La fonte ufficiale non consente il recupero automatico del documento.";
  }
}
