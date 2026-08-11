export const DRAFT_CATEGORIES = ['TP', 'VAT', 'Pillar Two', 'Anti-Avoidance'] as const;
export type DraftCategory = (typeof DRAFT_CATEGORIES)[number];

export type ValidDraft = {
  publishable: true;
  title: string;
  summary: string;
  content_markdown: string;
  category: DraftCategory;
  normative_references: string[];
};

export type DraftValidation =
  | { ok: true; value: ValidDraft }
  | { ok: false; reason: string };

export function validateDraft(value: unknown): DraftValidation {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'risposta LLM non strutturata' };
  const draft = value as Record<string, unknown>;

  if (draft.publishable !== true) {
    const reason = typeof draft.rejection_reason === 'string' ? draft.rejection_reason.trim() : '';
    return { ok: false, reason: `fonte non adatta a una notizia${reason ? `: ${reason}` : ''}` };
  }

  const title = typeof draft.title === 'string' ? draft.title.trim() : '';
  const summary = typeof draft.summary === 'string' ? draft.summary.trim() : '';
  const content = typeof draft.content_markdown === 'string' ? draft.content_markdown.trim() : '';
  const category = String(draft.category ?? '') as DraftCategory;

  if (title.length < 25 || title.length > 180) return { ok: false, reason: `titolo non valido (${title.length} caratteri)` };
  if (summary.length < 100 || summary.length > 500) return { ok: false, reason: `sommario non valido (${summary.length} caratteri)` };
  if (content.length < 1200) return { ok: false, reason: `articolo troppo breve (${content.length} caratteri)` };
  if (!DRAFT_CATEGORIES.includes(category)) return { ok: false, reason: `categoria non valida: ${category}` };

  if (!Array.isArray(draft.normative_references) || draft.normative_references.some((item) => typeof item !== 'string')) {
    return { ok: false, reason: 'riferimenti normativi non validi' };
  }

  return {
    ok: true,
    value: {
      publishable: true,
      title,
      summary,
      content_markdown: content,
      category,
      normative_references: draft.normative_references.map((item) => item.trim()).filter(Boolean),
    },
  };
}
