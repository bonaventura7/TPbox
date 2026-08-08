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

import type { NewsFeedResult, NewsFilters, NewsSource } from "../domain/types";
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
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
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

interface FilterableQuery<T> {
  eq(column: string, value: string): T;
  or(filter: string): T;
}

function applyFilters<T extends FilterableQuery<T>>(query: T, filters: NewsFilters): T {
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

  let status: RepoStatus = "OK";
  let rows: unknown[] = [];

  try {
    rows = await withTimeout(async () =>
      retryIdempotent(async () => {
        const { data, error } = await applyFilters(
          client.from(PUBLIC_VIEWS.attualita).select("*"),
          filters,
        ).limit(500);
        if (error) {
          const classified = classifyReadError(error);
          if (classified === "SCHEMA_UNAVAILABLE") {
            status = classified;
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

  if (status === "SCHEMA_UNAVAILABLE") {
    audit({
      correlationId,
      action: "news.real.list",
      actorRole: "USER",
      at: generatedAt,
      outcome: "ERROR",
      detail: `vista ${PUBLIC_VIEWS.attualita} non disponibile`,
    });
    return emptyRealResult({ correlationId, status, generatedAt });
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
};
