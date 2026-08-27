/**
 * Serializzazione del draft in markdown.
 *
 * Scelta di contenuto-modello: box e takeaway NON richiedono nuove colonne.
 * Vivono dentro `content_markdown` con una sintassi callout stabile, che il
 * parser di pagina (`src/lib/domain/article-markdown.ts`) riconosce e rende
 * come box editoriale. Nessuna seconda tabella, nessuna migrazione.
 */
import type { DraftBox, DraftSource, EditorialDraft } from "./types";

export function renderBox(box: DraftBox): string {
  const head = `> [!${box.kind}] ${box.title}`;
  const body = box.lines.map((line) => `> ${line}`.trimEnd());
  return [head, ...body].join("\n");
}

export function renderTakeaways(takeaways: string[]): string {
  if (takeaways.length === 0) return "";
  return ["## Punti chiave", "", ...takeaways.map((item) => `- ${item}`)].join("\n");
}

export function renderSources(sources: DraftSource[]): string {
  if (sources.length === 0) return "";
  const lines = sources.map(
    (source) =>
      `- [${source.label}](${source.url})${source.role === "SECONDARY" ? " — contesto secondario" : ""}`,
  );
  return ["## Fonti", "", ...lines].join("\n");
}

/** Corpo completo: analisi, box, punti chiave, fonti. */
export function renderDraftMarkdown(draft: EditorialDraft): string {
  return [draft.bodyMd.trim(), ...draft.boxes.map(renderBox), renderTakeaways(draft.takeaways), renderSources(draft.sources)]
    .filter(Boolean)
    .join("\n\n");
}
