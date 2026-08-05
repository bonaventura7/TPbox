/**
 * Modello di dominio del Portale interpelli.
 * Unica fonte pubblica prevista: Agenzia delle Entrate - Risposte agli interpelli.
 * Tutti i record del prototipo sono sintetici e marcati come demo.
 */

export const INTERPELLO_MATERIE = [
  "Transfer pricing",
  "Fiscalità internazionale",
  "Reddito d'impresa e IRES",
  "IVA e operazioni con l'estero",
  "Operazioni straordinarie",
  "Agevolazioni fiscali",
  "Lavoro dipendente e mobilità internazionale",
  "Riscossione, accertamento e sanzioni",
  "Altre materie",
] as const;
export type InterpelloMateria = (typeof INTERPELLO_MATERIE)[number];

export type InterpelloStatus = "PUBLISHED" | "STALE" | "ARCHIVED";

/** Modalità di acquisizione previste per l'adapter server-side. */
export type InterpelloAcquisitionMode = "HTML_WATCH" | "MANUAL_IMPORT" | "DISABLED";

/** Dominio unico ammesso in allowlist per l'acquisizione futura. */
export const INTERPELLI_ALLOWED_HOST = "www.agenziaentrate.gov.it";

export const INTERPELLI_SOURCE_URL =
  "https://www.agenziaentrate.gov.it/portale/normativa-e-prassi/risposte-agli-interpelli";

export interface InterpelloRecord {
  id: string;
  responseNumber: string;
  title: string;
  publishedAt: string;
  year: number;
  materia: InterpelloMateria;
  keywords: string[];
  abstract: string;
  officialUrl: string;
  sourceName: "Agenzia delle Entrate";
  sourceType: "ISTITUZIONALE";
  lastVerifiedAt: string;
  status: InterpelloStatus;
  isDemo: true;
}

export type InterpelloSort = "RECENT_FIRST" | "OLDEST_FIRST";

export interface InterpelloQuery {
  query: string;
  materie: InterpelloMateria[];
  year: number | null;
  sort: InterpelloSort;
  page: number;
  pageSize: number;
}

export type InterpelloServiceStatus = "OK" | "STALE" | "DEGRADED" | "ERROR";

export interface InterpelloSearchResult {
  correlationId: string;
  serviceStatus: InterpelloServiceStatus;
  message: string;
  acquisitionMode: InterpelloAcquisitionMode;
  lastVerifiedAt: string;
  items: InterpelloRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  availableYears: number[];
}
