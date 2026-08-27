/**
 * Sottoinsieme markdown prodotto da `news-generate`, ridotto a blocchi.
 * Modulo puro: la struttura del testo si decide qui e si testa senza React,
 * il componente si limita a renderla.
 */

export const CALLOUT_KINDS = ["NORMATIVA", "TECNICO", "PRATICA", "ATTENZIONE"] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

export type ArticleBlock =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "callout"; callout: CalloutKind; title: string; blocks: ArticleBlock[] };

const HEADING = /^(#{1,6})\s+(.+)$/;
const BULLET = /^\s*[-*•]\s+(.+)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.+)$/;
const QUOTE = /^>\s?(.*)$/;
const CALLOUT_HEAD = /^\[!([A-Z]+)\]\s*(.*)$/;

function isCalloutKind(value: string): value is CalloutKind {
  return (CALLOUT_KINDS as readonly string[]).includes(value);
}

/**
 * Box editoriale: `> [!NORMATIVA] Titolo` seguito da righe citate. Vive dentro
 * `content_markdown`, così box e punti chiave non richiedono nuove colonne.
 */
function parseCallout(lines: string[]): ArticleBlock | null {
  const stripped: string[] = [];
  for (const line of lines) {
    const match = QUOTE.exec(line);
    if (!match) return null;
    stripped.push(match[1] ?? "");
  }
  const head = CALLOUT_HEAD.exec((stripped[0] ?? "").trim());
  if (!head) return null;
  const kind = (head[1] ?? "").trim();
  if (!isCalloutKind(kind)) return null;

  return {
    kind: "callout",
    callout: kind,
    title: (head[2] ?? "").trim(),
    blocks: parseArticleMarkdown(stripped.slice(1).join("\n")),
  };
}


export function parseArticleMarkdown(source: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];

  for (const raw of source.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    if (lines[0]?.startsWith(">")) {
      const callout = parseCallout(lines);
      if (callout) {
        blocks.push(callout);
        continue;
      }
    }



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
