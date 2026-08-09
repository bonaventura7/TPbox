import {
  DEMO_DRAFTS_PENDING,
  DEMO_NEWS,
  DEMO_SOURCES,
  getAvailableCountries,
} from "../domain/demo-data";
import type {
  GeoArea,
  Language,
  NewsCategory,
  NewsFeedResult,
  NewsFilters,
  NewsItem,
  NewsSource,
  ServiceHealth,
  SourceKind,
  SourceTier,
  Topic,
} from "../domain/types";
import { supabaseAdmin } from "../../integrations/supabase/client.server";
import {
  CircuitBreaker,
  audit,
  newCorrelationId,
  retryIdempotent,
  withTimeout,
} from "../platform/resilience.server";

/**
 * Repository della sezione Attualità. Legge la vista `v_attualita`, che espone i soli
 * articoli PUBLISHED e a cui si applica la RLS del chiamante.
 *
 * Non esiste un fallback silenzioso ai contenuti dimostrativi. Se la query non trova
 * righe, o fallisce, la sezione resta vuota e lo stato del servizio lo dichiara. Il
 * fallback sembrava una rete di sicurezza ed era il contrario: avrebbe servito articoli
 * inventati come se fossero reali, sotto la firma dello Studio, ogni volta che il
 * database non risponde — e il lettore non ha modo di distinguerli. Un sito vuoto è
 * recuperabile, un sito che mente no.
 *
 * I DEMO_NEWS restano raggiungibili solo con NEWS_DEMO_MODE=true, che si accende a mano
 * in sviluppo e non è mai il valore predefinito.
 */
const breaker = new CircuitBreaker();

const STALE_AFTER_HOURS = 36;
const DEMO_MODE = process.env["NEWS_DEMO_MODE"] === "true";

function computeHealth(now: Date, lastPublishedAt: string | null): ServiceHealth {
  if (!breaker.canPass()) return "DEGRADED";
  if (DEMO_MODE) {
    const disabledPrimary = DEMO_SOURCES.some(
      (source) => source.tier === "PRIMARY" && source.acquisitionMode === "DISABLED",
    );
    if (disabledPrimary) return "DEGRADED";
  }
  // Nessun articolo pubblicato: la sezione non è degradata, è vuota. Dichiararla STALE
  // è l'informazione corretta per chi la guarda dall'interno.
  if (!lastPublishedAt) return "STALE";
  const hours = (now.getTime() - new Date(lastPublishedAt).getTime()) / 3_600_000;
  return hours > STALE_AFTER_HOURS ? "STALE" : "OK";
}

/** Riga della vista v_attualita. Ogni campo del dominio ha una colonna: nulla è dedotto. */
interface AttualitaRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: NewsCategory | null;
  country: string | null;
  source_name: string | null;
  source_url: string | null;
  pdf_url: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author_type: "HUMAN" | "AI_ASSISTED";
  reviewed_by: string | null;
  primary_source_verified_at: string | null;
  geo: GeoArea;
  topic: Topic;
  language: Language;
  source_kind: SourceKind;
  source_tier: SourceTier;
}

function toNewsItem(row: AttualitaRow): NewsItem {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary ?? "",
    sourceId: row.slug,
    sourceName: row.source_name ?? "",
    sourceKind: row.source_kind,
    sourceTier: row.source_tier,
    originalDate: row.published_at ?? row.created_at,
    lastVerifiedAt: row.primary_source_verified_at ?? row.updated_at,
    language: row.language,
    geo: row.geo,
    topic: row.topic,
    originalUrl: row.source_url ?? "",
    workflowState: "PUBLISHED",
    isDemo: false,
    authorType: row.author_type,
    // exactOptionalPropertyTypes è attivo: una proprietà opzionale o c'è con un valore,
    // o non c'è. Assegnarle undefined è un errore di tipo, non una scorciatoia.
    ...(row.reviewed_by ? { reviewedBy: row.reviewed_by } : {}),
    ...(row.primary_source_verified_at
      ? { primarySourceVerifiedAt: row.primary_source_verified_at }
      : {}),
    ...(row.category ? { category: row.category } : {}),
    ...(row.country ? { country: row.country } : {}),
    ...(row.pdf_url ? { pdfUrl: row.pdf_url } : {}),
  };
}

/**
 * `src/integrations/supabase/types.ts` è generato automaticamente ed è stato prodotto
 * quando il database non aveva ancora tabelle: dichiara `Tables: { [_ in never]: never }`,
 * quindi `.from()` è tipizzato `never` e non accetta alcun nome di relazione. Il cast è
 * circoscritto a questa unica funzione e va rimosso appena i tipi vengono rigenerati
 * sulle migrazioni. La forma delle righe resta comunque verificata da `AttualitaRow`.
 */
type ViewReader = {
  from(relation: string): {
    select(columns: string): {
      order(
        column: string,
        options: { ascending: boolean },
      ): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
};

async function loadPublished(): Promise<NewsItem[]> {
  if (DEMO_MODE) return publishedOnly(DEMO_NEWS);
  const reader = supabaseAdmin as unknown as ViewReader;
  const { data, error } = await reader
    .from("v_attualita")
    .select("*")
    .order("published_at", { ascending: false });
  if (error) throw new Error(`v_attualita: ${error.message}`);
  return (data ?? []).map((row) => toNewsItem(row as AttualitaRow));
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

  let items: NewsItem[] = [];
  let loadFailed = false;
  try {
    items = await withTimeout(async () =>
      retryIdempotent(async () => {
        const published = (await loadPublished())
          .slice()
          .sort((a, b) => b.originalDate.localeCompare(a.originalDate));
        breaker.recordSuccess();
        return published;
      }),
    );
  } catch (error) {
    // La sezione resta vuota e lo stato lo dichiara. Non si sostituiscono i demo:
    // servirli qui significherebbe mostrare articoli inventati come reali proprio nel
    // momento in cui il sistema non è in grado di dire la verità.
    breaker.recordFailure();
    loadFailed = true;
    audit({
      correlationId,
      action: "news.list",
      actorRole: "USER",
      at: now.toISOString(),
      outcome: "ERROR",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

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

  const lastPublishedAt = items[0]?.originalDate ?? null;

  return {
    correlationId,
    generatedAt: now.toISOString(),
    health: loadFailed ? "DEGRADED" : computeHealth(now, lastPublishedAt),
    lastPipelineRunAt: lastPublishedAt ?? now.toISOString(),
    featured: isFiltering ? null : (items[0] ?? null),
    latest: isFiltering ? [] : items.slice(1, 4),
    archive: filtered,
    totalPublished: items.length,
    draftsPending: DEMO_MODE ? DEMO_DRAFTS_PENDING : 0,
    availableCountries: getAvailableCountries(items),
  };
}

export function listSources(): NewsSource[] {
  return DEMO_SOURCES;
}