/**
 * Corpo dell'articolo redazionale.
 *
 * `news-generate` produce markdown (600-900 parole, con sezioni). Qui se ne
 * rende il sottoinsieme effettivamente usato — titoli, capoversi, elenchi,
 * grassetto, collegamenti — costruendo elementi React, non HTML.
 *
 * Nessuna dipendenza nuova e nessun `dangerouslySetInnerHTML`: il testo arriva
 * da un modello linguistico e da una fonte esterna, quindi non è materiale da
 * iniettare nel documento. È anche la scelta che tiene lontano il difetto di
 * idratazione già visto sul portale (React #418).
 */
import type { ReactNode } from "react";

import {
  parseArticleMarkdown,
  type ArticleBlock,
  type CalloutKind,
} from "@/lib/domain/article-markdown";

import { safeUrl } from "@/lib/domain/source-link";

/** Grassetto e collegamenti. Un URL con schema diverso da http resta testo. */
function renderInline(text: string): ReactNode[] {
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  const out: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) out.push(text.slice(cursor, match.index));
    if (match[1] !== undefined) {
      out.push(<strong key={key++}>{match[1]}</strong>);
    } else {
      const url = safeUrl(match[3]);
      out.push(
        url ? (
          <a
            key={key++}
            href={url.toString()}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-petrol underline underline-offset-4"
          >
            {match[2]}
          </a>
        ) : (
          match[2]
        ),
      );
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

const CALLOUT_LABEL: Record<CalloutKind, string> = {
  NORMATIVA: "Riferimenti normativi",
  TECNICO: "Nota tecnica",
  PRATICA: "Profili operativi",
  ATTENZIONE: "Da tenere presente",
};

/** Bordo laterale e nessun colore pieno: box editoriale, non card SaaS. */
const CALLOUT_STYLE: Record<CalloutKind, string> = {
  NORMATIVA: "border-l-petrol/70",
  TECNICO: "border-l-border",
  PRATICA: "border-l-gold/70",
  ATTENZIONE: "border-l-destructive/60",
};

function renderBlocks(blocks: ArticleBlock[], keyPrefix = "b"): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}-${index}`;

    if (block.kind === "heading") {
      return block.level === 2 ? (
        <h2 key={key} className="mt-10 font-serif text-xl leading-snug sm:text-2xl">
          {renderInline(block.text)}
        </h2>
      ) : (
        <h3 key={key} className="mt-8 font-serif text-lg leading-snug">
          {renderInline(block.text)}
        </h3>
      );
    }

    if (block.kind === "list") {
      const items = block.items.map((item, i) => (
        <li key={i} className="ml-5 list-outside">
          {renderInline(item)}
        </li>
      ));
      return block.ordered ? (
        <ol key={key} className="list-decimal space-y-2">
          {items}
        </ol>
      ) : (
        <ul key={key} className="list-disc space-y-2">
          {items}
        </ul>
      );
    }

    if (block.kind === "callout") {
      const label = CALLOUT_LABEL[block.callout];
      return (
        <aside
          key={key}
          aria-label={block.title || label}
          className={`my-8 border border-border border-l-4 bg-surface p-5 ${CALLOUT_STYLE[block.callout]}`}
        >
          <p className="text-[0.7rem] font-semibold tracking-widest text-muted-foreground uppercase">
            {label}
          </p>
          {block.title ? (
            <h3 className="mt-1 font-serif text-lg leading-snug">{renderInline(block.title)}</h3>
          ) : null}
          <div className="mt-3 space-y-3 text-sm leading-relaxed">
            {renderBlocks(block.blocks, key)}
          </div>
        </aside>
      );
    }

    return <p key={key}>{renderInline(block.text)}</p>;
  });
}

export function ArticleBody({ markdown }: { markdown: string }) {
  const blocks = parseArticleMarkdown(markdown);

  return (
    <div className="mt-8 space-y-5 text-[0.975rem] leading-relaxed">{renderBlocks(blocks)}</div>
  );
}

