/**
 * Valora Suite — contratti di dominio.
 * Nessuna dipendenza da React, rete o filesystem. Nessun segreto.
 */

export type ISODate = string; // YYYY-MM-DD

export type ValoraCategory = "COST_OF_CAPITAL" | "RISK_PREMIA" | "CREDIT" | "VALUATION" | "DATASET";

export type ValoraKind = "TOOL" | "DATASET" | "RESOURCE";

/** Stato del modulo/dataset. STALE e UNAVAILABLE non producono mai dati inventati. */
export type ValoraStatus = "LIVE" | "DEMO" | "STALE" | "UNAVAILABLE" | "PLANNED";

export type ValoraMode = "demo" | "live";

/** Livello della fonte. Solo PRIMARY può essere esposto in UI o alimentare metadati. */
export type SourceTier = "PRIMARY";

/** Stato dichiarato della fonte primaria. */
export type SourceStatus = "VERIFIED" | "PENDING_VERIFICATION" | "STALE" | "UNAVAILABLE";

export interface ValoraSource {
  /** Identificativo stabile della fonte (usato dal futuro source_registry). */
  readonly id: string;
  /** Solo fonti primarie e istituzionali: nessun prodotto, brand o persona di terzi. */
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
  /** Uso consentito del riferimento (nessuna copia, nessun scraping, nessun iframe). */
  readonly permittedUse: string;
  /** Limiti d'uso dichiarati. */
  readonly limitations: string;
  /** Avviso professionale mostrato accanto al riferimento. */
  readonly professionalNotice: string;
}

/**
 * Riferimento di discovery interno: mai esposto in UI, mai usato per alimentare
 * dati o calcoli. Non contiene denominazioni di prodotti, siti o persone terze.
 */
export interface InternalDiscoveryReference {
  readonly id: string;
  readonly exposed: false;
  readonly feedsData: false;
  /** Nota interna generica sull'ambito di ricerca manuale. */
  readonly scopeNote: string;
}

export interface ValoraItem {
  readonly id: string;
  readonly kind: ValoraKind;
  readonly category: ValoraCategory;
  readonly title: string;
  readonly description: string;
  readonly status: ValoraStatus;
  readonly mode: ValoraMode;
  /** Rotta interna del modulo, quando esiste. */
  readonly route: string | null;
  readonly sourceId: string;
  /** Versione del dataset/metodo, se dichiarabile. */
  readonly version: string | null;
  /** Checksum del dataset, se disponibile. */
  readonly checksum: string | null;
  readonly lastVerifiedAt: ISODate | null;
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
  | "CHECKSUM_MISSING"
  | "MANIFEST_INCOMPLETE"
  | "SOURCE_UNKNOWN"
  | "PRIMARY_SOURCE_MISSING"
  | "SOURCE_DATE_MISSING"
  | "SOURCE_STATUS_INVALID"
  | "ROUTE_UNKNOWN"
  | "STATUS_MODE_MISMATCH";

export interface QualityFinding {
  readonly code: FindingCode;
  readonly severity: FindingSeverity;
  /** Oggetto ispezionato: id di item o di fonte. */
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
  /** L'ispettore non pubblica nulla: è solo un giudizio informativo. */
  readonly passed: boolean;
}
