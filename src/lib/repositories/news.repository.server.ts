import {
  DEMO_DRAFTS_PENDING,
  DEMO_NEWS,
  DEMO_SOURCES,
  getAvailableCountries,
} from "../domain/demo-data";
import type {
  NewsFeedResult,
  NewsFilters,
  NewsItem,
  NewsSource,
  ServiceHealth,
} from "../domain/types";
import {
  CircuitBreaker,
  audit,
  newCorrelationId,
  retryIdempotent,
  withTimeout,
} from "../platform/resilience.server";

/**
 * Mock repository. Sostituibile con un repository Supabase (RLS + ruoli)
 * mantenendo la stessa firma.
 */
const breaker = new CircuitBreaker();

/**
 * Il dataset dimostrativo è un'istantanea, non l'esito di una pipeline: qui non
 * c'è nulla che possa invecchiare. La versione precedente confrontava l'orologio
 * con una data scritta a mano e da un certo giorno in poi dichiarava per sempre
 * «Contenuti non recenti: l'ultimo aggiornamento della pipeline redazionale
 * risale a un intervallo superiore alle 36 ore». Era telemetria inventata, su un
 * portale la cui promessa è la verificabilità della fonte. Lo stato di freschezza
 * appartiene al repository reale, dove nasce da un fatto.
 *
 * DEGRADED resta, perché descrive una proprietà vera della configurazione demo:
 * una fonte primaria disattivata.
 */
function computeHealth(): ServiceHealth {
  if (!breaker.canPass()) return "DEGRADED";
  const disabledPrimary = DEMO_SOURCES.some(
    (source) => source.tier === "PRIMARY" && source.acquisitionMode === "DISABLED",
  );
  return disabledPrimary ? "DEGRADED" : "OK";
}

/**
 * Ultima verifica redazionale presente nei dati demo: derivata, non dichiarata.
 * Se il dataset cambia, questa segue.
 */
function lastVerifiedInDemoData(): string {
  const verified = publishedOnly(DEMO_NEWS)
    .map((item) => item.lastVerifiedAt)
    .sort();
  return verified.at(-1) ?? new Date(0).toISOString();
}

/** Solo gli elementi PUBLISHED sono visibili al pubblico: nessuna bozza esce automaticamente. */
function publishedOnly(items: NewsItem[]): NewsItem[] {
  return items.filter((item) => item.workflowState === "PUBLISHED");
}

function matches(item: NewsItem, filters: NewsFilters): boolean {
  const q = filters.query.trim().toLowerCase();
  if (q.length > 0) {
    const haystack = `${item.title} ${item.summary} ${item.sourceName} ${item.topic}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (filters.geo !== "TUTTE" && item.geo !== filters.geo) return false;
  if (filters.topic !== "TUTTI" && item.topic !== filters.topic) return false;
  if (filters.category !== "TUTTE" && item.category !== filters.category) return false;
  if (filters.country.trim().length > 0 && item.country !== filters.country) return false;
  if (filters.institutionalOnly && item.sourceKind !== "ISTITUZIONALE") return false;
  return true;
}

/** Contratto storico del mock: i campi diagnostici sono aggiunti dall'adattatore. */
export type MockNewsFeedResult = Omit<
  NewsFeedResult,
  "repoKind" | "repoStatus" | "rejectedRows"
>;

export async function listNewsFeed(filters: NewsFilters): Promise<MockNewsFeedResult> {
  const correlationId = newCorrelationId();
  const now = new Date();

  const items = await withTimeout(async () =>
    retryIdempotent(async () => {
      const published = publishedOnly(DEMO_NEWS).slice().sort((a, b) =>
        b.originalDate.localeCompare(a.originalDate),
      );
      breaker.recordSuccess();
      return published;
    }),
  );

  const filtered = items.filter((item) => matches(item, filters));
  const isFiltering =
    filters.query.trim().length > 0 ||
    filters.geo !== "TUTTE" ||
    filters.topic !== "TUTTI" ||
    filters.category !== "TUTTE" ||
    filters.country.trim().length > 0 ||
    filters.institutionalOnly;

  audit({
    correlationId,
    action: "news.list",
    actorRole: "USER",
    at: now.toISOString(),
    outcome: "OK",
    detail: `${filtered.length} elementi`,
  });

  return {
    correlationId,
    generatedAt: now.toISOString(),
    health: computeHealth(),
    lastPipelineRunAt: lastVerifiedInDemoData(),
    featured: isFiltering ? null : (items[0] ?? null),
    latest: isFiltering ? [] : items.slice(1, 4),
    archive: filtered,
    totalPublished: items.length,
    draftsPending: DEMO_DRAFTS_PENDING,
    availableCountries: getAvailableCountries(items),
  };
}

export function listSources(): NewsSource[] {
  return DEMO_SOURCES;
}