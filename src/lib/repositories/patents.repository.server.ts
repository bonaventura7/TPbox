/**
 * Adapter server-side per l'indice brevetti. Il browser non contatta mai il
 * provider: la UI interroga solo questo repository tramite server function.
 *
 * Pipeline: fetch (solo host in allowlist) -> parsing -> normalizzazione ->
 * DRAFT -> revisione -> indice interno pubblicato. In assenza di acquisizione
 * attiva si serve l'indice dimostrativo, sempre etichettato DEMO.
 */

import { PATENT_DEMO_INDEX } from "../patents/demo-data";
import type {
  PatentAcquisitionMode,
  PatentQuery,
  PatentRecord,
  PatentSearchResult,
} from "../patents/types";
import {
  CircuitBreaker,
  audit,
  newCorrelationId,
} from "../platform/resilience.server";

/** Allowlist esclusiva: qualunque altro host viene rifiutato (protezione SSRF). */
const ALLOWED_HOSTS = ["patentscope.wipo.int", "www.wipo.int"] as const;

const ACQUISITION_MODE: PatentAcquisitionMode = "DISABLED";
const RATE_LIMIT_PER_MINUTE = 30;
const LAST_SYNC_AT = "2026-07-30T06:00:00.000Z";

const breaker = new CircuitBreaker(3, 30_000);
const rateWindow: number[] = [];

export function isAllowedSourceUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    return (ALLOWED_HOSTS as readonly string[]).includes(url.hostname);
  } catch {
    return false;
  }
}

function withinRateLimit(): boolean {
  const now = Date.now();
  while (rateWindow.length > 0 && now - (rateWindow[0] ?? 0) > 60_000) rateWindow.shift();
  if (rateWindow.length >= RATE_LIMIT_PER_MINUTE) return false;
  rateWindow.push(now);
  return true;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function tokens(value: string): readonly string[] {
  return normalize(value).split(/\s+/).filter((token) => token.length > 1);
}

function haystack(record: PatentRecord): string {
  return normalize(
    [
      record.publicationNumber,
      record.title,
      record.abstract,
      record.technologyArea,
      record.tpRelevance,
      ...record.applicants,
      ...record.inventors,
      ...record.ipcCodes,
      ...record.jurisdictions,
    ].join(" "),
  );
}

function score(record: PatentRecord, terms: readonly string[]): number {
  if (terms.length === 0) return 0;
  const title = normalize(record.title);
  const body = haystack(record);
  let total = 0;
  for (const term of terms) {
    if (title.includes(term)) total += 3;
    if (body.includes(term)) total += 1;
  }
  return total;
}

function year(dateIso: string): number {
  return Number(dateIso.slice(0, 4));
}

function buildFacets(records: readonly PatentRecord[]): PatentSearchResult["facets"] {
  const jurisdictions = new Set<string>();
  const areas = new Set<string>();
  const years = new Set<number>();
  for (const record of records) {
    record.jurisdictions.forEach((code) => jurisdictions.add(code));
    areas.add(record.technologyArea);
    years.add(year(record.publicationDate));
  }
  return {
    jurisdictions: [...jurisdictions].sort(),
    technologyAreas: [...areas].sort(),
    years: [...years].sort((a, b) => b - a),
  };
}

/** Indice pubblicato: in futuro sarà una lettura da database con RLS. */
function publishedIndex(): readonly PatentRecord[] {
  return PATENT_DEMO_INDEX;
}

export function searchPatents(input: PatentQuery): PatentSearchResult {
  const correlationId = newCorrelationId();
  const index = publishedIndex();
  const facets = buildFacets(index);

  if (!withinRateLimit()) {
    audit({
      correlationId,
      action: "patents.search",
      actorRole: "USER",
      at: new Date().toISOString(),
      outcome: "DENIED",
      detail: "rate limit",
    });
    return {
      status: "DEGRADED",
      items: [],
      total: 0,
      page: 1,
      pageSize: input.pageSize,
      correlationId,
      lastSyncAt: LAST_SYNC_AT,
      acquisitionMode: ACQUISITION_MODE,
      message:
        "Troppe ricerche in poco tempo. Attendi qualche secondo e riprova: il servizio è protetto da un limite di frequenza.",
      facets,
    };
  }

  if (!breaker.canPass()) {
    audit({
      correlationId,
      action: "patents.search",
      actorRole: "USER",
      at: new Date().toISOString(),
      outcome: "ERROR",
      detail: "circuit open",
    });
    return {
      status: "STALE",
      items: index.slice(0, input.pageSize),
      total: index.length,
      page: 1,
      pageSize: input.pageSize,
      correlationId,
      lastSyncAt: LAST_SYNC_AT,
      acquisitionMode: ACQUISITION_MODE,
      message:
        "Aggiornamento sospeso temporaneamente: stiamo mostrando gli ultimi dati già pubblicati nel portale.",
      facets,
    };
  }

  const terms = tokens(input.query);
  const applicantTerm = normalize(input.applicant);
  const ipcTerm = normalize(input.ipc);

  let filtered = index.filter((record) => {
    if (terms.length > 0 && score(record, terms) === 0) return false;
    if (
      applicantTerm.length > 0 &&
      !record.applicants.some((name) => normalize(name).includes(applicantTerm))
    ) {
      return false;
    }
    if (
      ipcTerm.length > 0 &&
      !record.ipcCodes.some((code) => normalize(code).includes(ipcTerm))
    ) {
      return false;
    }
    if (input.jurisdiction && !record.jurisdictions.includes(input.jurisdiction)) return false;
    if (input.technologyArea && record.technologyArea !== input.technologyArea) return false;
    const publicationYear = year(record.publicationDate);
    if (input.yearFrom !== null && publicationYear < input.yearFrom) return false;
    if (input.yearTo !== null && publicationYear > input.yearTo) return false;
    return true;
  });

  filtered = [...filtered].sort((a, b) => {
    switch (input.sort) {
      case "DATA_ASC":
        return a.publicationDate.localeCompare(b.publicationDate);
      case "DATA_DESC":
        return b.publicationDate.localeCompare(a.publicationDate);
      case "FAMIGLIA_DESC":
        return b.familySize - a.familySize;
      default: {
        const delta = score(b, terms) - score(a, terms);
        return delta !== 0 ? delta : b.publicationDate.localeCompare(a.publicationDate);
      }
    }
  });

  const pageSize = Math.min(Math.max(input.pageSize, 5), 50);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(input.page, 1), totalPages);
  const start = (page - 1) * pageSize;

  breaker.recordSuccess();
  audit({
    correlationId,
    action: "patents.search",
    actorRole: "USER",
    at: new Date().toISOString(),
    outcome: "OK",
    detail: `results=${filtered.length}`,
  });

  return {
    status: "DEMO",
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    correlationId,
    lastSyncAt: LAST_SYNC_AT,
    acquisitionMode: ACQUISITION_MODE,
    facets,
  };
}

export function getPatentById(id: string): {
  status: "OK" | "NOT_FOUND";
  record: PatentRecord | null;
  related: readonly PatentRecord[];
  correlationId: string;
  lastSyncAt: string;
} {
  const correlationId = newCorrelationId();
  const index = publishedIndex();
  const record = index.find((item) => item.id === id) ?? null;
  const related = record
    ? index
        .filter(
          (item) => item.id !== record.id && item.technologyArea === record.technologyArea,
        )
        .slice(0, 3)
    : [];
  audit({
    correlationId,
    action: "patents.detail",
    actorRole: "USER",
    at: new Date().toISOString(),
    outcome: record ? "OK" : "ERROR",
    detail: id,
  });
  return {
    status: record ? "OK" : "NOT_FOUND",
    record,
    related,
    correlationId,
    lastSyncAt: LAST_SYNC_AT,
  };
}