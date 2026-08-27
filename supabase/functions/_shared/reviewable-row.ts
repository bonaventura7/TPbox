/**
 * Serializzazione fail-closed verso `news_items`.
 *
 * Invariante: questo modulo NON produce mai `PUBLISHED`. Lo stato di ingresso
 * in pipeline è sempre `DRAFT`; la pubblicazione è una decisione separata
 * (news-publish) e richiede `gate_result.ok = true`.
 */

/** Difesa in profondità: sotto questa lunghezza nessuna pubblicazione. */
export const MIN_PUBLISHABLE_CONTENT_CHARS = 900;

export interface GateResult {
  ok: boolean;
  reasons: string[];
}

export function buildGateResult(reasons: string[]): GateResult {
  const clean = reasons.map((reason) => String(reason).trim()).filter(Boolean);
  return { ok: clean.length === 0, reasons: clean };
}

export interface ReviewableNewsInput {
  slug: string;
  title: string;
  summary?: string | null;
  contentMarkdown?: string | null;
  category?: string | null;
  country?: string | null;
  sourceName?: string | null;
  sourceUrl: string;
  pdfUrl?: string | null;
  normativeReferences?: string[];
  reasons: string[];
}

export interface ReviewableNewsRow {
  slug: string;
  title: string;
  summary: string | null;
  content_markdown: string | null;
  category: string | null;
  country: string | null;
  source_name: string | null;
  source_url: string;
  pdf_url: string | null;
  normative_references: string[];
  status: 'DRAFT';
  flag_pending_review: boolean;
  gate_result: GateResult;
  fetched_at: string;
}

export function toReviewableNewsItemRow(input: ReviewableNewsInput): ReviewableNewsRow {
  const content = (input.contentMarkdown ?? '').trim();
  const reasons = [...input.reasons];
  if (content.length < MIN_PUBLISHABLE_CONTENT_CHARS) {
    reasons.push(
      `articolo troppo breve: ${content.length} caratteri (minimo ${MIN_PUBLISHABLE_CONTENT_CHARS})`,
    );
  }
  const gate = buildGateResult(reasons);

  return {
    slug: input.slug,
    title: input.title,
    summary: input.summary?.trim() || null,
    content_markdown: content || null,
    category: input.category ?? null,
    country: input.country ?? null,
    source_name: input.sourceName ?? null,
    source_url: input.sourceUrl,
    pdf_url: input.pdfUrl ?? null,
    normative_references: input.normativeReferences ?? [],
    status: 'DRAFT',
    flag_pending_review: !gate.ok,
    gate_result: gate,
    fetched_at: new Date().toISOString(),
  };
}
