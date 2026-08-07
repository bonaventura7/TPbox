import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NewsFeedResult, NewsFilters, NewsItem, NewsSource, ServiceHealth } from "../domain/types";
import { mapPublishedNewsRow, type PublishedNewsRow } from "./newsAdapter";

const STALE_AFTER_HOURS = 36;
type NewsFeedRow = PublishedNewsRow;

function getSupabaseServerClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server configuration is missing");
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function matches(item: NewsItem, filters: NewsFilters): boolean {
  const q = filters.query.trim().toLowerCase();
  if (q && !`${item.title} ${item.summary} ${item.sourceName} ${item.topic}`.toLowerCase().includes(q)) return false;
  if (filters.geo !== "TUTTE" && item.geo !== filters.geo) return false;
  if (filters.topic !== "TUTTI" && item.topic !== filters.topic) return false;
  if (filters.category !== "TUTTE" && item.category !== filters.category) return false;
  if (filters.country.trim() && item.country !== filters.country) return false;
  if (filters.institutionalOnly && item.sourceKind !== "ISTITUZIONALE") return false;
  return true;
}

function computeHealth(lastPipelineRunAt: string | null, now: Date): ServiceHealth {
  if (!lastPipelineRunAt) return "STALE";
  const ageHours = (now.getTime() - new Date(lastPipelineRunAt).getTime()) / 3_600_000;
  return ageHours > STALE_AFTER_HOURS ? "STALE" : "OK";
}

export async function listNewsFeed(filters: NewsFilters): Promise<NewsFeedResult> {
  const client = getSupabaseServerClient();
  const correlationId = crypto.randomUUID();
  const now = new Date();
  const { data, error } = await client
    .from("v_news_published")
    .select("id,it_title,it_summary,it_content,it_references,primary_source_url,source_name,category,country,status,published_at,fetched_at,disclaimer,needs_review,ai_metadata")
    .order("published_at", { ascending: false });
  if (error) throw new Error(`News feed unavailable: ${error.message}`);

  const items = (data ?? []).map((row) => mapPublishedNewsRow(row as NewsFeedRow));
  const filtered = items.filter((item) => matches(item, filters));
  const isFiltering = Boolean(filters.query.trim() || filters.geo !== "TUTTE" || filters.topic !== "TUTTI" || filters.category !== "TUTTE" || filters.country.trim() || filters.institutionalOnly);
  const lastPipelineRunAt = items.reduce<string | null>((latest, item) => (!latest || item.lastVerifiedAt > latest ? item.lastVerifiedAt : latest), null);

  const { count: draftsPending, error: draftError } = await client
    .from("news_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "DRAFT");
  if (draftError) throw new Error(`News workflow status unavailable: ${draftError.message}`);

  return {
    correlationId,
    generatedAt: now.toISOString(),
    health: computeHealth(lastPipelineRunAt, now),
    lastPipelineRunAt: lastPipelineRunAt ?? now.toISOString(),
    featured: isFiltering ? null : (items[0] ?? null),
    latest: isFiltering ? [] : items.slice(1, 4),
    archive: filtered,
    totalPublished: items.length,
    draftsPending: draftsPending ?? 0,
    availableCountries: [...new Set(items.map((item) => item.country).filter(Boolean) as string[])].sort(),
  };
}

export async function listSources(): Promise<NewsSource[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("news_sources")
    .select("id,name,acquisition_mode,tier,kind,feed_url,site_url,geo,note")
    .order("name");
  if (error) throw new Error(`News sources unavailable: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    acquisitionMode: row.acquisition_mode,
    tier: row.tier,
    kind: row.kind,
    feedUrl: row.feed_url ?? null,
    siteUrl: String(row.site_url),
    geo: row.geo,
    note: row.note ?? "",
  }));
}
