/**
 * Dominio "Patent & IP" del portale. Il modello è indipendente dal provider:
 * l'indice interno viene alimentato lato server (adapter WIPO/PATENTSCOPE),
 * mentre l'utente resta sempre dentro il portale.
 */

export type PatentAcquisitionMode = "HTML_WATCH" | "MANUAL_IMPORT" | "DISABLED";

/** Stato del servizio esposto alla UI per la graceful degradation. */
export type PatentServiceStatus = "LIVE" | "DEMO" | "STALE" | "DEGRADED" | "ERROR";

export interface PatentRecord {
  id: string;
  /** Numero di pubblicazione (es. WO/2023/123456). */
  publicationNumber: string;
  title: string;
  /** Abstract redazionale sintetico, non testo integrale del provider. */
  abstract: string;
  applicants: readonly string[];
  inventors: readonly string[];
  /** Codici di classificazione internazionale (IPC). */
  ipcCodes: readonly string[];
  filingDate: string;
  publicationDate: string;
  /** Uffici/giurisdizioni di deposito o designazione. */
  jurisdictions: readonly string[];
  familySize: number;
  /** Categoria tecnologica normalizzata dal portale. */
  technologyArea: string;
  /** Nota di rilevanza per transfer pricing / DEMPE. */
  tpRelevance: string;
  sourceName: string;
  officialUrl: string;
  /** Etichetta trasparenza: i dati dimostrativi sono sempre marcati. */
  dataOrigin: "DEMO" | "ACQUISITO";
  lastVerifiedAt: string;
}

export type PatentSort = "RELEVANZA" | "DATA_DESC" | "DATA_ASC" | "FAMIGLIA_DESC";

export interface PatentQuery {
  query: string;
  applicant: string;
  ipc: string;
  jurisdiction: string;
  technologyArea: string;
  yearFrom: number | null;
  yearTo: number | null;
  sort: PatentSort;
  page: number;
  pageSize: number;
}

export interface PatentSearchResult {
  status: PatentServiceStatus;
  items: readonly PatentRecord[];
  total: number;
  page: number;
  pageSize: number;
  correlationId: string;
  /** Ultimo allineamento dell'indice interno. */
  lastSyncAt: string;
  acquisitionMode: PatentAcquisitionMode;
  message?: string;
  facets: {
    jurisdictions: readonly string[];
    technologyAreas: readonly string[];
    years: readonly number[];
  };
}