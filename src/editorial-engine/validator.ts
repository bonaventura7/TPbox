/**
 * Quality gate del draft redazionale.
 *
 * Fail-closed: un draft privo di fonte, troppo breve per il suo tipo, con
 * placeholder residui o slug non valido non passa. Il validator non giudica la
 * verità dei dati — quella sta nella fonte — ma misura struttura e densità.
 */
import { renderDraftMarkdown } from "./markdown";
import { checkDraftSources } from "./source-policy";
import { structureFor } from "./structure";
import {
  DRAFT_CATEGORIES,
  NEWS_TYPES,
  type DraftBox,
  type DraftBoxKind,
  type DraftSource,
  type DraftValidation,
  type EditorialDraft,
} from "./types";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Tracce di generazione incompleta o di invenzione dichiarata. */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\blorem ipsum\b/i,
  /\bTBD\b/,
  /\bTODO\b/,
  /\bXXX+\b/,
  /\[inserire[^\]]*\]/i,
  /\[da (?:verificare|completare)[^\]]*\]/i,
  /\bN\/?A\b\s*%/,
  /\{\{[^}]+\}\}/,
  /\bplaceholder\b/i,
  /\bnome dell'ente\b/i,
];

export function countWords(markdown: string): number {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`\-\[\]()]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function headingTexts(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) => /^(#{2,3})\s+(.+)$/.exec(line.trim())?.[2]?.trim())
    .filter((value): value is string => Boolean(value));
}

function validateSources(sources: DraftSource[], reasons: string[]): void {
  if (sources.length === 0) {
    reasons.push("draft privo di fonti: nessuna pubblicazione senza documento citato");
    return;
  }
  if (!sources.some((source) => source.role === "PRIMARY")) {
    reasons.push("nessuna fonte primaria: il contesto secondario non basta");
  }
  for (const source of sources) {
    if (!source.label.trim()) reasons.push("fonte senza etichetta");
    if (!isHttpUrl(source.url)) reasons.push(`URL fonte non valida: ${source.url}`);
  }
  // Fail-closed sul dominio: la whitelist istituzionale è l'unica ammessa.
  reasons.push(...checkDraftSources(sources));
}

function validateBoxes(boxes: DraftBox[], required: DraftBoxKind[], reasons: string[]): void {
  for (const box of boxes) {
    if (!box.title.trim()) reasons.push(`box ${box.kind} senza titolo`);
    if (box.lines.filter((line) => line.trim()).length === 0) {
      reasons.push(`box ${box.kind} senza contenuto`);
    }
  }
  const present = new Set(boxes.map((box) => box.kind));
  for (const kind of required) {
    if (!present.has(kind)) reasons.push(`box obbligatorio mancante per il tipo: ${kind}`);
  }
}

const STOPWORDS = new Set([
  "il",
  "lo",
  "la",
  "i",
  "gli",
  "le",
  "un",
  "uno",
  "una",
  "di",
  "del",
  "della",
  "dei",
  "degli",
  "delle",
  "e",
  "per",
  "con",
  "su",
  "nel",
  "nella",
  "nei",
  "alle",
  "ai",
  "al",
  "da",
  "dal",
  "in",
  "a",
  "che",
  "non",
  "come",
  "cosa",
  "resta",
  "sul",
]);

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/**
 * Copertura delle sezioni attese: il confronto è per parole significative, così
 * una variante lessicale ("…con presenza in India" per "…nella giurisdizione")
 * non fa cadere il gate, mentre un articolo che salta metà struttura sì.
 */
function sectionCoverage(headings: string[], sections: string[]): number {
  if (sections.length === 0) return 1;
  const headingWords = headings.map((heading) => new Set(significantWords(heading)));
  const matched = sections.filter((section) => {
    const words = significantWords(section);
    if (words.length === 0) return true;
    return headingWords.some(
      (set) => words.filter((word) => set.has(word)).length / words.length >= 0.5,
    );
  });
  return matched.length / sections.length;
}

export function validateEditorialDraft(input: unknown): DraftValidation<EditorialDraft> {
  const reasons: string[] = [];
  if (!input || typeof input !== "object") {
    return { ok: false, reasons: ["draft non strutturato"] };
  }
  const draft = input as Partial<EditorialDraft>;

  const newsType = draft.newsType;
  if (!newsType || !NEWS_TYPES.includes(newsType)) {
    return { ok: false, reasons: [`tipo di notizia non valido: ${String(newsType)}`] };
  }
  if (!draft.category || !DRAFT_CATEGORIES.includes(draft.category)) {
    reasons.push(`categoria non valida: ${String(draft.category)}`);
  }

  const title = (draft.title ?? "").trim();
  const excerpt = (draft.excerpt ?? "").trim();
  const bodyMd = (draft.bodyMd ?? "").trim();
  const slug = (draft.slug ?? "").trim();
  const sources = Array.isArray(draft.sources) ? draft.sources : [];
  const boxes = Array.isArray(draft.boxes) ? draft.boxes : [];
  const takeaways = (Array.isArray(draft.takeaways) ? draft.takeaways : [])
    .map((item) => String(item).trim())
    .filter(Boolean);
  const normativeReferences = (
    Array.isArray(draft.normativeReferences) ? draft.normativeReferences : []
  )
    .map((item) => String(item).trim())
    .filter(Boolean);

  if (title.length < 25 || title.length > 180) {
    reasons.push(`titolo non valido (${title.length} caratteri)`);
  }
  if (excerpt.length < 120 || excerpt.length > 600) {
    reasons.push(`lead non valido (${excerpt.length} caratteri)`);
  }
  if (!SLUG.test(slug) || slug.length > 160) reasons.push(`slug non valido: ${slug}`);

  const structure = structureFor(newsType);
  const words = countWords(bodyMd);
  if (words < structure.minWords) {
    reasons.push(
      `articolo troppo breve per ${newsType}: ${words} parole (minimo ${structure.minWords})`,
    );
  }

  const headings = headingTexts(bodyMd);
  if (headings.length < 3) {
    reasons.push(`struttura insufficiente: ${headings.length} sezioni (minimo 3)`);
  }
  const coverage = sectionCoverage(headings, structure.sections);
  if (coverage < 0.6) {
    reasons.push(
      `struttura non conforme al tipo ${newsType}: copertura sezioni ${Math.round(coverage * 100)}% (minimo 60%)`,
    );
  }
  if (takeaways.length < structure.minTakeaways) {
    reasons.push(`takeaway insufficienti: ${takeaways.length} (minimo ${structure.minTakeaways})`);
  }

  validateSources(sources, reasons);
  validateBoxes(boxes, structure.boxes, reasons);

  const scanned = [title, excerpt, bodyMd, ...takeaways, ...boxes.flatMap((box) => box.lines)].join(
    "\n",
  );
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(scanned)) {
      reasons.push(`placeholder o testo non verificato: ${pattern.source}`);
    }
  }

  if (reasons.length > 0) return { ok: false, reasons };

  return {
    ok: true,
    value: {
      newsType,
      category: draft.category!,
      title,
      slug,
      excerpt,
      bodyMd,
      sources,
      boxes,
      takeaways,
      normativeReferences,
    },
  };
}

/**
 * Riga pronta per `news_items`. Stato DRAFT per costruzione: l'engine non
 * pubblica, propone.
 */
export function toNewsItemRow(draft: EditorialDraft) {
  const primary = draft.sources.find((source) => source.role === "PRIMARY") ?? draft.sources[0];
  return {
    slug: draft.slug,
    title: draft.title,
    summary: draft.excerpt,
    content_markdown: renderDraftMarkdown(draft),
    normative_references: draft.normativeReferences,
    source_url: primary?.url ?? null,
    status: "DRAFT" as const,
  };
}

export type NewsItemDraftRow = ReturnType<typeof toNewsItemRow>;

/**
 * Unico ingresso ammesso in pipeline: valida e poi serializza. Se il gate non
 * passa non esiste riga da scrivere, e la riga prodotta è sempre DRAFT — la
 * pubblicazione resta una decisione umana separata (news-publish).
 */
export function toReviewableNewsItemRow(input: unknown): DraftValidation<NewsItemDraftRow> {
  const validation = validateEditorialDraft(input);
  if (!validation.ok) return validation;
  const row = toNewsItemRow(validation.value);
  if (row.status !== "DRAFT") {
    return { ok: false, reasons: ["stato non consentito: l'engine non pubblica"] };
  }
  return { ok: true, value: row };
}

/**
 * ---------------------------------------------------------------------------
 * Gate di INGRESSO della generazione (fail-closed, prima di qualsiasi LLM).
 *
 * Un modello senza materiale primario può solo inventare: se il testo della
 * fonte è troppo corto o i fatti verificabili sono meno di tre, la generazione
 * non parte. Le soglie sono condivise con il gate lato pipeline
 * (`supabase/functions/_shared/generation-input.ts`) e verificate in parità dai
 * test, così non esistono due politiche divergenti.
 * ---------------------------------------------------------------------------
 */

export interface GenerationFact {
  statement: string;
  sourceUrl: string;
}

export interface GenerationInput {
  primaryText: string;
  facts: GenerationFact[];
}

export const MIN_PRIMARY_TEXT_CHARS = 2000;
export const MIN_GENERATION_FACTS = 3;

/** Motivi di blocco dell'input di generazione. Array vuoto = input ammesso. */
export function validateGenerationInput(input: unknown): string[] {
  const reasons: string[] = [];
  if (!input || typeof input !== "object") return ["input di generazione non strutturato"];

  const candidate = input as Partial<GenerationInput>;
  const primaryText = typeof candidate.primaryText === "string" ? candidate.primaryText.trim() : "";
  const facts = Array.isArray(candidate.facts) ? candidate.facts : [];

  if (primaryText.length < MIN_PRIMARY_TEXT_CHARS) {
    reasons.push(
      `testo della fonte primaria insufficiente: ${primaryText.length} caratteri (minimo ${MIN_PRIMARY_TEXT_CHARS})`,
    );
  }
  if (facts.length < MIN_GENERATION_FACTS) {
    reasons.push(
      `fatti verificabili insufficienti: ${facts.length} (minimo ${MIN_GENERATION_FACTS})`,
    );
  }
  for (const fact of facts) {
    const statement = typeof fact?.statement === "string" ? fact.statement.trim() : "";
    const sourceUrl = typeof fact?.sourceUrl === "string" ? fact.sourceUrl.trim() : "";
    if (!statement) reasons.push("fatto privo di enunciato");
    if (!isHttpUrl(sourceUrl)) reasons.push(`fatto senza URL fonte valida: ${sourceUrl}`);
  }

  return reasons;
}
