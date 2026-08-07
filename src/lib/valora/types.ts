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

export interface ValoraSource {
  /** Identificativo stabile della fonte (usato dal futuro source_registry). */
  readonly id: string;
  readonly name: string;
  /** Autore/curatore attribuito. Nessuno scraping, nessun iframe. */
  readonly attribution: string;
  /** URL ufficiale, sempre HTTPS e su host in allowlist. */
  readonly officialUrl: string;
  /** Data del dato più recente noto, se dichiarata dalla fonte. */
  readonly lastKnownDataDate: ISODate | null;
  /** Data dell'ultima verifica manuale dei metadati. */
  readonly lastVerifiedAt: ISODate | null;
  readonly licenseNote: string;
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

/* ------------------------------------------------------------------ */
/* Contratti per future tabelle (Supabase/RLS). Nessuna migrazione ora. */
/* ------------------------------------------------------------------ */

export interface SourceRegistryRow {
  readonly id: string;
  readonly name: string;
  readonly official_url: string;
  readonly attribution: string;
  readonly acquisition_mode: "MANUAL_IMPORT" | "HTML_WATCH" | "DISABLED";
  readonly status: ValoraStatus;
  readonly created_at: string;
}

export interface SourceVersionRow {
  readonly id: string;
  readonly source_id: string;
  readonly version: string;
  readonly checksum: string | null;
  readonly data_date: ISODate | null;
  readonly created_at: string;
}

export interface SourceCheckRow {
  readonly id: string;
  readonly source_id: string;
  readonly checked_at: string;
  readonly outcome: "OK" | "STALE" | "UNAVAILABLE";
  readonly correlation_id: string;
}

export interface QualityFindingRow extends QualityFinding {
  readonly id: string;
  readonly catalog_version: string;
  readonly created_at: string;
}

export interface UpdateProposalRow {
  readonly id: string;
  readonly source_id: string;
  readonly proposed_version: string;
  readonly state: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  readonly created_by: string | null;
  readonly created_at: string;
}

export interface ReviewDecisionRow {
  readonly id: string;
  readonly proposal_id: string;
  readonly decision: "APPROVE" | "REJECT";
  readonly rationale: string;
  readonly decided_by: string | null;
  readonly decided_at: string;
}

export interface UserFavoriteRow {
  readonly id: string;
  readonly user_id: string;
  readonly item_id: string;
  readonly created_at: string;
}

export interface SavedAnalysisRow {
  readonly id: string;
  readonly user_id: string;
  readonly item_id: string;
  readonly label: string;
  readonly payload: Record<string, unknown>;
  readonly created_at: string;
}

export interface AuditEventRow {
  readonly id: string;
  readonly correlation_id: string;
  readonly action: string;
  readonly actor_role: "USER" | "EDITOR" | "ADMIN" | "PRO" | "SYSTEM";
  readonly outcome: "OK" | "DENIED" | "ERROR";
  readonly at: string;
}

/** Repository di lettura del catalogo: oggi mock, domani adapter Supabase. */
export interface ValoraCatalogRepository {
  listSources(): Promise<readonly SourceRegistryRow[]>;
  listVersions(sourceId: string): Promise<readonly SourceVersionRow[]>;
  listChecks(sourceId: string): Promise<readonly SourceCheckRow[]>;
  listFindings(): Promise<readonly QualityFinding[]>;
}
