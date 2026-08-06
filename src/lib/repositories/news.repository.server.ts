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

const STALE_AFTER_HOURS = 36;
const LAST_PIPELINE_RUN_AT = "2026-08-04T07:20:00Z";

function computeHealth(now: Date): ServiceHealth {
  if (!breaker.canPass()) return "DEGRADED";
  const disabledPrimary = DEMO_SOURCES.some(
    (source) => source.tier === "PRIMARY" && source.acquisitionMode === "DISABLED",
  );
  if (disabledPrimary) return "DEGRADED";
  const hours =
    (now.getTime() - new Date(LAST_PIPELINE_RUN_AT).getTime()) / 3_600_000;
  return hours > STALE_AFTER_HOURS ? "STALE" : "OK";
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

export async function listNewsFeed(filters: NewsFilters): Promise<NewsFeedResult> {
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
    health: computeHealth(now),
    lastPipelineRunAt: LAST_PIPELINE_RUN_AT,
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