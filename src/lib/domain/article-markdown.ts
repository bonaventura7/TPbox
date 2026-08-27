/**
 * Sottoinsieme markdown prodotto da `news-generate`, ridotto a blocchi.
 * Modulo puro: la struttura del testo si decide qui e si testa senza React,
 * il componente si limita a renderla.
 */

export type ArticleBlock =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

const HEADING = /^(#{1,6})\s+(.+)$/;
const BULLET = /^\s*[-*•]\s+(.+)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.+)$/;

export function parseArticleMarkdown(source: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];

  for (const raw of source.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const heading = lines.length === 1 ? HEADING.exec(lines[0] ?? "") : null;
    if (heading) {
      blocks.push({
        kind: "heading",
        level: (heading[1] ?? "##").length <= 2 ? 2 : 3,
        text: (heading[2] ?? "").trim(),
      });
      continue;
    }

    if (lines.every((line) => BULLET.test(line))) {
      blocks.push({
        kind: "list",
        ordered: false,
        items: lines.map((line) => (BULLET.exec(line)?.[1] ?? line).trim()),
      });
      continue;
    }

    if (lines.every((line) => NUMBERED.test(line))) {
      blocks.push({
        kind: "list",
        ordered: true,
        items: lines.map((line) => (NUMBERED.exec(line)?.[1] ?? line).trim()),
      });
      continue;
    }

    blocks.push({ kind: "paragraph", text: lines.join(" ") });
  }

  return blocks;
}
