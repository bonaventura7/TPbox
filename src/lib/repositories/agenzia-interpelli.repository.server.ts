/**
 * Adapter server-side per le risposte agli interpelli dell'Agenzia delle Entrate.
 *
 * Modalità iniziale: MANUAL_IMPORT con dati dimostrativi, perché la fonte ufficiale
 * può applicare protezioni anti-automazione o modificare il markup.
 *
 * Pipeline futura (nessuna pubblicazione automatica):
 * fetch server-side -> allowlist agenziaentrate.gov.it -> parsing metadati ->
 * normalizzazione -> classificazione per materia -> deduplicazione per numero/anno/URL ->
 * DRAFT -> revisione editoriale -> PUBLISHED.
 */
import { DEMO_INTERPELLI } from "../domain/interpelli.demo";
import {
  INTERPELLI_ALLOWED_HOST,
  type InterpelloAcquisitionMode,
  type InterpelloQuery,
  type InterpelloRecord,
  type InterpelloSearchResult,
} from "../domain/interpelli";
import {
  CircuitBreaker,
  audit,
  newCorrelationId,
  retryIdempotent,
  withTimeout,
} from "../platform/resilience.server";

const ACQUISITION_MODE: InterpelloAcquisitionMode = "MANUAL_IMPORT";
const breaker = new CircuitBreaker();

/** Protezione SSRF: sono ammessi soltanto documenti del dominio ufficiale. */
export function isAllowedSourceUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === "https:" &&
      (url.hostname === INTERPELLI_ALLOWED_HOST ||
        url.hostname === "agenziaentrate.gov.it")
    );
  } catch {
    return false;
  }
}

/** Deduplicazione per numero/anno/URL, applicata anche ai dati importati manualmente. */
function dedupe(records: InterpelloRecord[]): InterpelloRecord[] {
  const seen = new Set<string>();
  return records.filter((item) => {
    const key = `${item.responseNumber}|${item.year}|${item.officialUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Rate limit in-memory per correlazione tecnica; nessun dettaglio esposto all'UI. */
const RATE_LIMIT = { max: 60, windowMs: 60_000 };
let windowStart = Date.now();
let calls = 0;

function withinRateLimit(): boolean {
  const now = Date.now();
  if (now - windowStart > RATE_LIMIT.windowMs) {
    windowStart = now;
    calls = 0;
  }
  calls += 1;
  return calls <= RATE_LIMIT.max;
}

function matches(item: InterpelloRecord, input: InterpelloQuery): boolean {
  if (input.materie.length > 0 && !input.materie.includes(item.materia)) return false;
  if (input.year !== null && item.year !== input.year) return false;
  const term = input.query.trim().toLowerCase();
  if (term.length === 0) return true;
  return [item.title, item.responseNumber, item.abstract, item.materia, ...item.keywords]
    .join(" ")
    .toLowerCase()
    .includes(term);
}

export async function searchInterpelli(
  input: InterpelloQuery,
): Promise<InterpelloSearchResult> {
  const correlationId = newCorrelationId();
  const availableYears = [...new Set(DEMO_INTERPELLI.map((item) => item.year))].sort(
    (a, b) => b - a,
  );
  const lastVerifiedAt = DEMO_INTERPELLI.map((item) => item.lastVerifiedAt)
    .sort()
    .at(-1)!;

  const empty: InterpelloSearchResult = {
    correlationId,
    serviceStatus: "OK",
    message: "",
    acquisitionMode: ACQUISITION_MODE,
    lastVerifiedAt,
    items: [],
    total: 0,
    page: 1,
    pageSize: input.pageSize,
    totalPages: 1,
    availableYears,
  };

  if (!withinRateLimit() || !breaker.canPass()) {
    audit({
      correlationId,
      action: "interpelli.search",
      actorRole: "USER",
      at: new Date().toISOString(),
      outcome: "DENIED",
      detail: "limite di richieste o circuito aperto",
    });
    return {
      ...empty,
      serviceStatus: "DEGRADED",
      message:
        "Il servizio di consultazione è momentaneamente in modalità ridotta. L'archivio già pubblicato resta disponibile: riprova tra qualche istante.",
      items: pageOf(dedupe(DEMO_INTERPELLI), input).items,
      total: DEMO_INTERPELLI.length,
      totalPages: Math.max(1, Math.ceil(DEMO_INTERPELLI.length / input.pageSize)),
      page: input.page,
    };
  }

  const filtered = await withTimeout(async () =>
    retryIdempotent(async () => {
      breaker.recordSuccess();
      const pool = dedupe(DEMO_INTERPELLI).filter(
        (item) => item.status !== "ARCHIVED" || input.query.trim().length > 0,
      );
      return pool.filter((item) => matches(item, input));
    }),
  );

  const sorted = [...filtered].sort((a, b) =>
    input.sort === "RECENT_FIRST"
      ? b.publishedAt.localeCompare(a.publishedAt)
      : a.publishedAt.localeCompare(b.publishedAt),
  );

  const { items, page, totalPages } = pageOf(sorted, input);
  const stale = items.some((item) => item.status === "STALE");

  audit({
    correlationId,
    action: "interpelli.search",
    actorRole: "USER",
    at: new Date().toISOString(),
    outcome: "OK",
    detail: `${sorted.length} risultati`,
  });

  return {
    ...empty,
    serviceStatus: stale ? "STALE" : "OK",
    message: stale
      ? "Alcune schede attendono una nuova verifica della fonte ufficiale: i contenuti già pubblicati restano consultabili."
      : "",
    items,
    total: sorted.length,
    page,
    totalPages,
  };
}

function pageOf(records: InterpelloRecord[], input: InterpelloQuery) {
  const totalPages = Math.max(1, Math.ceil(records.length / input.pageSize));
  const page = Math.min(Math.max(1, input.page), totalPages);
  const start = (page - 1) * input.pageSize;
  return { items: records.slice(start, start + input.pageSize), page, totalPages };
}

export const agenziaInterpelliRepository = {
  acquisitionMode: ACQUISITION_MODE,
  allowedHost: INTERPELLI_ALLOWED_HOST,
  isAllowedSourceUrl,
  search: searchInterpelli,
};
