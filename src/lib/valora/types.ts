/**
 * Valora Suite — contratti di dominio del Catalog MVP.
 * Nessuna dipendenza da React, rete o filesystem. Nessun segreto.
 */

import type { FileRouteTypes } from "../../routeTree.gen";

export type ISODate = string; // YYYY-MM-DD

export type ValoraCategory = "COST_OF_CAPITAL" | "RISK_PREMIA" | "CREDIT" | "VALUATION" | "DATASET";

export type ValoraKind = "TOOL" | "DATASET" | "RESOURCE";

/** Stato del modulo. Nessun modulo del Catalog MVP è operativo. */
export type ValoraStatus = "PLANNED" | "IN_VALIDATION";

/** Livello della fonte. Solo fonti primarie esterne possono essere esposte. */
export type SourceTier = "PRIMARY";

/** Stato dichiarato della fonte primaria. */
export type SourceStatus = "VERIFIED" | "PENDING_VERIFICATION" | "STALE" | "UNAVAILABLE";

/**
 * Percorso interno realmente esistente: il tipo deriva dal router generato,
 * quindi un percorso inesistente è un errore di type-check e non una
 * convenzione di forma o una lista manuale.
 */
export type ValoraRoutePath = FileRouteTypes["fullPaths"];

export interface ValoraSource {
  /** Identificativo stabile della fonte. */
  readonly id: string;
  /** Solo fonti primarie esterne e istituzionali: nessun brand o persona terza. */
  readonly tier: SourceTier;
  /** Denominazione istituzionale della fonte primaria. */
  readonly primarySourceName: string;
  /** URL canonico della fonte primaria, sempre HTTPS e su host in allowlist. */
  readonly canonicalUrl: string;
  /** Data o versione dichiarata dalla fonte. null quando non disponibile. */
  readonly sourceDateOrVersion: string | null;
  /** Data dell'ultima verifica manuale dei metadati. null = non disponibile. */
  readonly lastVerifiedAt: ISODate | null;
  readonly status: SourceStatus;
  /** Uso consentito del riferimento (nessuna copia, nessun iframe, nessuno scraping). */
  readonly permittedUse: string;
  /** Limiti d'uso dichiarati. */
  readonly limitations: string;
  /** Avviso professionale mostrato accanto al riferimento. */
  readonly professionalNotice: string;
}

export interface ValoraItem {
  readonly id: string;
  readonly kind: ValoraKind;
  readonly category: ValoraCategory;
  readonly title: string;
  readonly description: string;
  readonly status: ValoraStatus;
  /** Percorso interno del modulo quando la pagina esiste, altrimenti null. */
  readonly route: ValoraRoutePath | null;
  readonly sourceId: string;
  /** Versione documentale della scheda, se dichiarabile. */
  readonly version: string | null;
  readonly lastVerifiedAt: ISODate | null;
  /** Relazioni metodologiche in forma simbolica, senza parametri né valori. */
  readonly formulaChain: readonly string[];
  readonly keywords: readonly string[];
}

export interface ValoraCatalog {
  readonly version: string;
  readonly generatedAt: ISODate;
  readonly sources: readonly ValoraSource[];
  readonly items: readonly ValoraItem[];
}

/* ------------------------------------------------------------------ */
/* Inspector                                                           */
/* ------------------------------------------------------------------ */

export type FindingSeverity = "INFO" | "WARNING" | "ERROR";

export type FindingCode =
  | "URL_NOT_HTTPS"
  | "URL_HOST_NOT_ALLOWED"
  | "VERIFICATION_MISSING"
  | "VERIFICATION_STALE"
  | "VERSION_MISSING"
  | "MANIFEST_INCOMPLETE"
  | "SOURCE_UNKNOWN"
  | "PRIMARY_SOURCE_MISSING"
  | "SOURCE_DATE_MISSING"
  | "SOURCE_STATUS_INVALID";

export interface QualityFinding {
  readonly code: FindingCode;
  readonly severity: FindingSeverity;
  readonly subjectId: string;
  readonly subjectKind: "item" | "source";
  readonly message: string;
}

export interface InspectionReport {
  readonly checkedAt: ISODate;
  readonly catalogVersion: string;
  readonly itemsChecked: number;
  readonly sourcesChecked: number;
  readonly findings: readonly QualityFinding[];
  readonly errors: number;
  readonly warnings: number;
  /** Giudizio informativo: l'ispettore non pubblica e non modifica nulla. */
  readonly passed: boolean;
}
