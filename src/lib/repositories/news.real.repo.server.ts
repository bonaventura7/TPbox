/**
 * Repository Attualità sul database reale (progetto canonico TP Box).
 *
 * Vincoli architetturali:
 * - lettura solo lato server, client publishable (RLS come `anon`), mai service-role;
 * - solo viste pubbliche di sola lettura (`v_attualita`, `v_biblioteca`): nessuna query
 *   su tabelle base o colonne non verificate;
 * - nessun fallback silenzioso ai dati demo: ogni anomalia è dichiarata in `repoStatus`.
 */
import { createClient } from "@supabase/supabase-js";

import { articleSlug } from "../domain/article";
import type { NewsFeedResult, NewsFilters, NewsItem, NewsSource } from "../domain/types";
import {
  CircuitBreaker,
  audit,
  newCorrelationId,
  retryIdempotent,
  withTimeout,
} from "../platform/resilience.server";
import { buildRealFeedResult, mapRows } from "./news.repo.mapping";
import type { NewsRepo, RepoStatus } from "./news.repo";
import { emptyRealResult } from "./news.repo";

/** Viste pubbliche ammesse: nessun'altra relazione è interrogabile. */
export const PUBLIC_VIEWS = {
  attualita: "v_attualita",
  biblioteca: "v_biblioteca",
} as const;

const breaker = new CircuitBreaker();

/** Distingue "vista assente/non accessibile" da "backend non raggiungibile". */
export function classifyReadError(error: { code?: string; message?: string } | null): RepoStatus {
  if (!error) return "OK";
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  if (
    code === "42P01" ||
    code === "42501" ||
    code === "PGRST205" ||
    code === "PGRST106" ||
    message.includes("does not exist") ||
    message.includes("permission denied") ||
    message.includes("could not find the table")
  ) {
    return "SCHEMA_UNAVAILABLE";
  }
  return "UNREACHABLE";
}

function createPublicClient() {
  const url =
    process.env["ATTUALITA_SUPABASE_URL"] ??
    import.meta.env["VITE_ATTUALITA_SUPABASE_URL"];
  const key =
    process.env["ATTUALITA_SUPABASE_PUBLISHABLE_KEY"] ??
    import.meta.env["VITE_ATTUALITA_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/**
 * Vista minimale del query builder: evita l'inferenza profonda dei tipi PostgREST
 * mantenendo esplicito il solo insieme di operazioni usate.
 */
export interface ReadQuery {
  eq(column: string, value: string): ReadQuery;
  or(filter: string): ReadQuery;
  limit(count: number): PromiseLike<{
    data: unknown[] | null;
    error: { code?: string; message?: string } | null;
  }>;
}

export function applyFilters(query: ReadQuery, filters: NewsFilters): ReadQuery {
  let q = query;
  if (filters.geo !== "TUTTE") q = q.eq("geo", filters.geo);
  if (filters.topic !== "TUTTI") q = q.eq("topic", filters.topic);
  if (filters.category !== "TUTTE") q = q.eq("category", filters.category);
  if (filters.country.trim().length > 0) q = q.eq("country", filters.country.trim());
  if (filters.institutionalOnly) q = q.eq("source_kind", "ISTITUZIONALE");
  const text = filters.query.trim();
  if (text.length > 0) {
    const safe = text.replace(/[%,()]/g, " ");
    q = q.or(`title.ilike.%${safe}%,summary.ilike.%${safe}%,source_name.ilike.%${safe}%`);
  }
  return q;
}

async function readAttualita(filters: NewsFilters): Promise<NewsFeedResult> {
  const correlationId = newCorrelationId();
  const generatedAt = new Date().toISOString();

  if (!breaker.canPass()) {
    return emptyRealResult({ correlationId, status: "UNREACHABLE", generatedAt });
  }

  const client = createPublicClient();
  if (!client) {
    audit({
      correlationId,
      action: "news.real.list",
      actorRole: "USER",
      at: generatedAt,
      outcome: "ERROR",
      detail: "configurazione backend assente",
    });
    return emptyRealResult({ correlationId, status: "UNREACHABLE", generatedAt });
  }

  const state: { status: RepoStatus } = { status: "OK" };
  let rows: unknown[] = [];

  try {
    rows = await withTimeout(async () =>
      retryIdempotent(async () => {
        const base = client
          .from(PUBLIC_VIEWS.attualita)
          .select("*") as unknown as ReadQuery;
        const { data, error } = await applyFilters(base, filters).limit(500);
        if (error) {
          const classified = classifyReadError(error);
          if (classified === "SCHEMA_UNAVAILABLE") {
            state.status = classified;
            return [];
          }
          throw new Error(error.message);
        }
        return (data ?? []) as unknown[];
      }),
    );
    breaker.recordSuccess();
  } catch {
    breaker.recordFailure();
    audit({
      correlationId,
      action: "news.real.list",
      actorRole: "USER",
      at: generatedAt,
      outcome: "ERROR",
      detail: "lettura vista pubblica non riuscita",
    });
    return emptyRealResult({ correlationId, status: "UNREACHABLE", generatedAt });
  }

  if (state.status === "SCHEMA_UNAVAILABLE") {
    audit({
      correlationId,
      action: "news.real.list",
      actorRole: "USER",
      at: generatedAt,
      outcome: "ERROR",
      detail: `vista ${PUBLIC_VIEWS.attualita} non disponibile`,
    });
    return emptyRealResult({ correlationId, status: state.status, generatedAt });
  }

  const { items, rejectedRows } = mapRows(rows);

  if (rows.length > 0 && items.length === 0) {
    return emptyRealResult({
      correlationId,
      status: "UNEXPECTED_SHAPE",
      rejectedRows,
      generatedAt,
    });
  }

  const finalStatus: RepoStatus =
    rejectedRows > 0 ? "UNEXPECTED_SHAPE" : items.length === 0 ? "EMPTY" : "OK";

  audit({
    correlationId,
    action: "news.real.list",
    actorRole: "USER",
    at: generatedAt,
    outcome: finalStatus === "UNEXPECTED_SHAPE" ? "ERROR" : "OK",
    detail: `${items.length} elementi, ${rejectedRows} righe scartate`,
  });

  if (finalStatus === "EMPTY") {
    return emptyRealResult({ correlationId, status: "EMPTY", generatedAt });
  }

  return buildRealFeedResult({
    correlationId,
    generatedAt,
    items,
    filters,
    rejectedRows,
    status: finalStatus,
  });
}

/**
 * Articolo singolo. Due passaggi, non uno: la vista pubblica espone `slug`, ma
 * una riga che lo ha nullo resterebbe irraggiungibile pur avendo una card in
 * pagina. Il secondo passaggio ricalcola lo slug derivato sulle righe
 * pubblicate e chiude quel buco, al costo di una lettura sola e solo in caso di
 * mancato riscontro.
 */
async function readArticle(slug: string): Promise<NewsItem | null> {
  const wanted = slug.trim().toLowerCase();
  if (wanted.length === 0) return null;

  const client = createPublicClient();
  if (!client) return null;
  if (!breaker.canPass()) return null;

  try {
    const direct = await withTimeout(async () =>
      retryIdempotent(async () => {
        const base = client.from(PUBLIC_VIEWS.attualita).select("*") as unknown as ReadQuery;
        const { data, error } = await base.eq("slug", wanted).limit(1);
        if (error) throw new Error(error.message);
        return (data ?? []) as unknown[];
      }),
    );
    breaker.recordSuccess();

    const mapped = mapRows(direct);
    const diretto = mapped.items[0];
    if (diretto) return diretto;

    const scan = await withTimeout(async () =>
      retryIdempotent(async () => {
        const query = client.from(PUBLIC_VIEWS.attualita).select("*") as unknown as ReadQuery;
        const { data, error } = await query.limit(500);
        if (error) throw new Error(error.message);
        return (data ?? []) as unknown[];
      }),
    );

    return mapRows(scan).items.find((item) => articleSlug(item) === wanted) ?? null;
  } catch {
    breaker.recordFailure();
    audit({
      correlationId: newCorrelationId(),
      action: "news.real.article",
      actorRole: "USER",
      at: new Date().toISOString(),
      outcome: "ERROR",
      detail: "lettura articolo non riuscita",
    });
    return null;
  }
}

/**
 * Le fonti non hanno ancora una vista pubblica verificata: nessuna query improvvisata.
 * Fino alla verifica dello schema la lista reale è vuota e la UI non mostra dati demo.
 */
async function readSources(): Promise<NewsSource[]> {
  return Promise.resolve([]);
}

export const realNewsRepo: NewsRepo = {
  kind: "REAL",
  getPublished: readAttualita,
  getSources: readSources,
  getBySlug: readArticle,
};
