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

import { parseArticleMarkdown } from "@/lib/domain/article-markdown";
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

export function ArticleBody({ markdown }: { markdown: string }) {
  const blocks = parseArticleMarkdown(markdown);

  return (
    <div className="mt-8 space-y-5 text-[0.975rem] leading-relaxed">
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return block.level === 2 ? (
            <h2 key={index} className="mt-10 font-serif text-xl leading-snug sm:text-2xl">
              {renderInline(block.text)}
            </h2>
          ) : (
            <h3 key={index} className="mt-8 font-serif text-lg leading-snug">
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
            <ol key={index} className="list-decimal space-y-2">
              {items}
            </ol>
          ) : (
            <ul key={index} className="list-disc space-y-2">
              {items}
            </ul>
          );
        }

        return <p key={index}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}
