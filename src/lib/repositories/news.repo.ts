/**
 * Interfaccia comune dei repository Attualità.
 * Due implementazioni: mock (dati demo) e real (DB TP Box).
 * Nessun fallback silenzioso: lo stato del repo reale è sempre esplicito nel risultato.
 */
import type { NewsFeedResult, NewsFilters, NewsSource } from "../domain/types";

export type RepoKind = "MOCK" | "REAL";

export type RepoStatus =
  | "OK"
  | "SCHEMA_UNAVAILABLE"
  | "UNREACHABLE"
  | "UNEXPECTED_SHAPE"
  | "EMPTY";

export interface NewsRepo {
  readonly kind: RepoKind;
  getPublished(filters: NewsFilters): Promise<NewsFeedResult>;
  getSources(): Promise<NewsSource[]>;
}

/**
 * Risultato "vuoto dichiarato" per il repo reale: mai dati demo al suo posto.
 * `health` resta OK solo quando il dataset reale è semplicemente vuoto.
 */
export function emptyRealResult(args: {
  correlationId: string;
  status: Exclude<RepoStatus, "OK">;
  rejectedRows?: number;
  generatedAt?: string;
}): NewsFeedResult {
  const now = args.generatedAt ?? new Date().toISOString();
  return {
    correlationId: args.correlationId,
    generatedAt: now,
    health: args.status === "EMPTY" ? "OK" : "DEGRADED",
    lastPipelineRunAt: now,
    featured: null,
    latest: [],
    archive: [],
    totalPublished: 0,
    draftsPending: 0,
    availableCountries: [],
    repoKind: "REAL",
    repoStatus: args.status,
    rejectedRows: args.rejectedRows ?? 0,
  };
}
