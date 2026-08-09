/**
 * Modello di dominio del portale Transfer Pricing.
 * Tutti i dati sono sintetici e marcati come demo.
 */

export const WORKFLOW_STATES = [
  "RECEIVED",
  "CLASSIFIED",
  "RELEVANT",
  "REJECTED",
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "CORRECTED",
  "ARCHIVED",
] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

/** Stato assegnato obbligatoriamente a ogni elemento acquisito dalla pipeline. */
export const INGESTION_ENTRY_STATE: WorkflowState = "DRAFT";

export type AcquisitionMode = "RSS" | "HTML_WATCH" | "MANUAL" | "DISABLED";
export type SourceTier = "PRIMARY" | "SECONDARY";
export type SourceKind = "ISTITUZIONALE" | "PROFESSIONALE" | "ACCADEMICA";
export type GeoArea = "OCSE" | "UE" | "ITALIA" | "GLOBALE";
export type Topic =
  | "Metodi e comparabili"
  | "Intangibili"
  | "Servizi infragruppo"
  | "Pillar Two"
  | "APA e MAP"
  | "Documentazione"
  | "Contenzioso";
export type Language = "it" | "en" | "fr";

/**
 * Macro-categoria editoriale per la sezione Attualità.
 * Affianca (non sostituisce) il campo `topic` più granulare.
 */
export const NEWS_CATEGORIES = [
  "Transfer Pricing",
  "VAT",
  "Pillar Two",
  "Anti-Avoidance",
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

/** Colori Tailwind per badge categoria. */
export const CATEGORY_COLORS: Record<NewsCategory, { border: string; text: string; bg: string }> = {
  "Transfer Pricing": { border: "border-teal-600/50",  text: "text-teal-700",   bg: "bg-teal-50" },
  "VAT":              { border: "border-amber-500/50", text: "text-amber-700",  bg: "bg-amber-50" },
  "Pillar Two":       { border: "border-blue-500/50",  text: "text-blue-700",   bg: "bg-blue-50" },
  "Anti-Avoidance":   { border: "border-red-500/50",   text: "text-red-700",    bg: "bg-red-50" },
};

export interface NewsSource {
  id: string;
  name: string;
  acquisitionMode: AcquisitionMode;
  tier: SourceTier;
  kind: SourceKind;
  /** null quando la modalità non prevede un feed verificato. */
  feedUrl: string | null;
  siteUrl: string;
  geo: GeoArea;
  note: string;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  sourceId: string;
  sourceName: string;
  sourceKind: SourceKind;
  sourceTier: SourceTier;
  originalDate: string;
  lastVerifiedAt: string;
  language: Language;
  geo: GeoArea;
  topic: Topic;
  originalUrl: string;
  workflowState: WorkflowState;
  /**
   * true solo per i contenuti dimostrativi. Era tipizzato sulla costante `true`, il che
   * rendeva impossibile rappresentare un articolo reale: nessun repository collegato al
   * database poteva restituire qualcosa che compilasse.
   */
  isDemo: boolean;
  /** Chi risponde del contenuto. Nessun articolo raggiunge il pubblico senza. */
  reviewedBy?: string;
  /** Redazione umana, oppure bozza generata e poi revisionata da una persona. */
  authorType?: "HUMAN" | "AI_ASSISTED";
  /** Quando una persona ha verificato la fonte primaria. Nulla lo deduce. */
  primarySourceVerifiedAt?: string;
  /** Macro-categoria editoriale (Transfer Pricing, VAT, Pillar Two, Anti-Avoidance). */
  category?: NewsCategory;
  /** Paese specifico a cui si riferisce la notizia (es. "India", "Germany"). */
  country?: string;
  /** URL diretto al documento PDF ufficiale scaricabile (se disponibile). */
  pdfUrl?: string;
}

export interface NewsFilters {
  query: string;
  geo: GeoArea | "TUTTE";
  topic: Topic | "TUTTI";
  institutionalOnly: boolean;
  /** Filtro per macro-categoria editoriale. */
  category: NewsCategory | "TUTTE";
  /** Filtro per paese specifico. Stringa vuota = tutti i paesi. */
  country: string;
}

export type ServiceHealth = "OK" | "STALE" | "DEGRADED";

export interface NewsFeedResult {
  correlationId: string;
  generatedAt: string;
  health: ServiceHealth;
  /** Data dell'ultimo aggiornamento pipeline riuscito. */
  lastPipelineRunAt: string;
  featured: NewsItem | null;
  latest: NewsItem[];
  archive: NewsItem[];
  totalPublished: number;
  draftsPending: number;
  /** Lista paesi distinti disponibili per il filtro (derivata dai dati). */
  availableCountries: string[];
}

export interface CompanyCandidate {
  companyId: string;
  legalName: string;
  country: string;
  city: string;
  legalForm: string;
  activity: string;
  lastFilingYear: number;
  isDemo: true;
}

export type CompanySearchMode = "NAME_SEARCH" | "VAT_SEARCH" | "INVALID_INPUT";

export interface CompanySearchResult {
  correlationId: string;
  mode: CompanySearchMode;
  message: string;
  candidates: CompanyCandidate[];
}

export interface FinancialYear {
  year: number;
  revenue: number;
  ebit: number;
  netResult: number;
  totalAssets: number;
  equity: number;
  employees: number;
}

export type BilancioStatus =
  | "OK"
  | "NOT_AUTHORIZED"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "DEGRADED"
  | "NOT_FOUND";

export interface BilancioResult {
  correlationId: string;
  status: BilancioStatus;
  message: string;
  companyId: string;
  legalName: string | null;
  years: FinancialYear[];
  ratios: { label: string; value: string }[];
  isDemo: true;
}

export type AppRole = "USER" | "EDITOR" | "ADMIN" | "PRO";
