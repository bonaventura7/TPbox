/**
 * Mappatura e validazione delle righe del DB reale verso il modello di dominio.
 * Modulo puro: nessun accesso a rete o segreti, così è testabile in isolamento.
 * Punto unico da allineare quando lo schema reale sarà verificato.
 */
import { z } from "zod";

import { getAvailableCountries } from "../domain/demo-data";
import type { NewsFeedResult, NewsFilters, NewsItem } from "../domain/types";
import { NEWS_CATEGORIES } from "../domain/types";
import type { RepoStatus } from "./news.repo";

const geoSchema = z.enum(["OCSE", "UE", "ITALIA", "GLOBALE"]);
const topicSchema = z.enum([
  "Metodi e comparabili",
  "Intangibili",
  "Servizi infragruppo",
  "Pillar Two",
  "APA e MAP",
  "Documentazione",
  "Contenzioso",
]);

/**
 * Schema di riga tollerante sui soli alias di naming (snake_case o camelCase),
 * rigoroso sui valori: una riga non conforme viene scartata, non "aggiustata".
 */
export const newsRowSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    title: z.string().min(1),
    // La vista pubblica può esporre summary NULL: si normalizza a stringa vuota,
    // senza inventare contenuto.
    summary: z.string().nullable().optional(),
    source_id: z.string().optional(),
    sourceId: z.string().optional(),
    source_name: z.string().optional(),
    sourceName: z.string().optional(),
    source_kind: z.enum(["ISTITUZIONALE", "PROFESSIONALE", "ACCADEMICA"]).optional(),
    sourceKind: z.enum(["ISTITUZIONALE", "PROFESSIONALE", "ACCADEMICA"]).optional(),
    source_tier: z.enum(["PRIMARY", "SECONDARY"]).optional(),
    sourceTier: z.enum(["PRIMARY", "SECONDARY"]).optional(),
    original_date: z.string().optional(),
    originalDate: z.string().optional(),
    last_verified_at: z.string().optional(),
    lastVerifiedAt: z.string().optional(),
    // Verifica della fonte primaria: campo reale della vista pubblica.
    primary_source_verified_at: z.string().optional().nullable(),
    language: z.enum(["it", "en", "fr"]).optional(),
    geo: geoSchema,
    topic: topicSchema,
    original_url: z.string().url().optional(),
    originalUrl: z.string().url().optional(),
    // Nome effettivo della colonna nella vista pubblica v_attualita.
    source_url: z.string().url().optional(),
    sourceUrl: z.string().url().optional(),
    category: z.enum(NEWS_CATEGORIES).optional().nullable(),
    country: z.string().optional().nullable(),
    pdf_url: z.string().url().optional().nullable(),
    pdfUrl: z.string().url().optional().nullable(),
    // Titolo del documento ufficiale: etichetta del rimando in pagina.
    source_document_title: z.string().optional().nullable(),
    sourceDocumentTitle: z.string().optional().nullable(),
    // Pagina articolo: slug e corpo redazionale prodotti da news-generate.
    slug: z.string().optional().nullable(),
    content_markdown: z.string().optional().nullable(),
    contentMarkdown: z.string().optional().nullable(),
    published_at: z.string().optional().nullable(),
  })
  .passthrough();

export type NewsRow = z.infer<typeof newsRowSchema>;

/** Converte una riga già validata in NewsItem. Ritorna null se manca un campo essenziale. */
export function mapRow(row: NewsRow): NewsItem | null {
  const originalUrl = row.original_url ?? row.originalUrl ?? row.source_url ?? row.sourceUrl;
  const originalDate = row.original_date ?? row.originalDate ?? row.published_at ?? undefined;
  if (!originalUrl || !originalDate) return null;

  const item: NewsItem = {
    id: String(row.id),
    title: row.title,
    summary: row.summary ?? "",
    sourceId: row.source_id ?? row.sourceId ?? "",
    sourceName: row.source_name ?? row.sourceName ?? "",
    sourceKind: row.source_kind ?? row.sourceKind ?? "ISTITUZIONALE",
    sourceTier: row.source_tier ?? row.sourceTier ?? "PRIMARY",
    originalDate,
    lastVerifiedAt:
      row.last_verified_at ?? row.lastVerifiedAt ?? row.primary_source_verified_at ?? originalDate,
    language: row.language ?? "it",
    geo: row.geo,
    topic: row.topic,
    originalUrl,
    // Le viste pubbliche espongono solo contenuti pubblicati.
    workflowState: "PUBLISHED",
    isDemo: false,
  };
  if (row.category) item.category = row.category;
  if (row.country) item.country = row.country;
  const pdf = row.pdf_url ?? row.pdfUrl;
  if (pdf) item.pdfUrl = pdf;
  const docTitle = (row.source_document_title ?? row.sourceDocumentTitle)?.trim();
  if (docTitle) item.sourceDocumentTitle = docTitle;
  const slug = row.slug?.trim();
  if (slug) item.slug = slug;
  const body = row.content_markdown ?? row.contentMarkdown;
  if (body && body.trim().length > 0) item.body = body;
  return item;
}

export interface MappedRows {
  items: NewsItem[];
  rejectedRows: number;
}

/** Valida e mappa un blocco di righe grezze, contando quelle scartate. */
export function mapRows(rows: readonly unknown[]): MappedRows {
  const items: NewsItem[] = [];
  let rejectedRows = 0;
  for (const raw of rows) {
    const parsed = newsRowSchema.safeParse(raw);
    if (!parsed.success) {
      rejectedRows += 1;
      continue;
    }
    const item = mapRow(parsed.data);
    if (item) items.push(item);
    else rejectedRows += 1;
  }
  return { items, rejectedRows };
}

function isFiltering(filters: NewsFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.geo !== "TUTTE" ||
    filters.topic !== "TUTTI" ||
    filters.category !== "TUTTE" ||
    filters.country.trim().length > 0 ||
    filters.institutionalOnly
  );
}

/** Compone il contratto NewsFeedResult a partire dagli item reali già filtrati. */
export function buildRealFeedResult(args: {
  correlationId: string;
  generatedAt: string;
  items: NewsItem[];
  filters: NewsFilters;
  rejectedRows: number;
  status: RepoStatus;
}): NewsFeedResult {
  const sorted = args.items.slice().sort((a, b) => b.originalDate.localeCompare(a.originalDate));
  const filtering = isFiltering(args.filters);
  const lastRun = sorted[0]?.lastVerifiedAt ?? args.generatedAt;
  return {
    correlationId: args.correlationId,
    generatedAt: args.generatedAt,
    health: args.status === "UNEXPECTED_SHAPE" ? "DEGRADED" : "OK",
    lastPipelineRunAt: lastRun,
    featured: filtering ? null : (sorted[0] ?? null),
    latest: filtering ? [] : sorted.slice(1, 4),
    archive: sorted,
    totalPublished: sorted.length,
    draftsPending: 0,
    availableCountries: getAvailableCountries(sorted),
    repoKind: "REAL",
    repoStatus: args.status,
    rejectedRows: args.rejectedRows,
  };
}
