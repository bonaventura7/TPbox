/**
 * Terzo livello: la fonte ufficiale dell'articolo.
 *
 * Sta nella pagina articolo e non nella card, perché è il documento su cui
 * l'articolo è basato, non un'alternativa alla lettura. Etichetta derivata dal
 * tipo di risorsa e nessun doppione: entrambe le regole vivono in
 * `buildSourceLinks`, qui si rende solo l'esito.
 */
import { Download, ExternalLink, ShieldAlert } from "lucide-react";

import type { NewsItem } from "@/lib/domain/types";
import { buildSourceLinks } from "@/lib/domain/source-link";

export function SourceBlock({ item }: { item: NewsItem }) {
  const links = buildSourceLinks(item);

  return (
    <section
      aria-labelledby="fonte-ufficiale"
      className="mt-10 border border-border bg-surface p-5 sm:p-6"
    >
      <h2 id="fonte-ufficiale" className="font-serif text-lg">
        Fonte ufficiale
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {item.sourceName}
        {item.country ? ` · ${item.country}` : ""}
      </p>

      {links.length === 0 ? (
        <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Documento ufficiale non disponibile: la fonte indicata non è un collegamento
            consultabile. L&apos;articolo resta leggibile, ma il rinvio al documento non viene
            mostrato finché non è verificabile.
          </span>
        </p>
      ) : (
        <ul className="mt-4 flex flex-wrap items-center gap-3">
          {links.map((link) => (
            <li key={link.url}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                aria-label={`${link.label}: ${item.title}`}
                className={
                  link.kind === "PDF"
                    ? "inline-flex min-h-11 items-center gap-2 rounded border border-border bg-secondary px-3 text-sm font-medium text-foreground hover:bg-secondary/80"
                    : "inline-flex min-h-11 items-center gap-2 text-sm font-medium text-petrol underline underline-offset-4"
                }
              >
                {link.kind === "PDF" ? <Download className="h-4 w-4" aria-hidden="true" /> : null}
                {link.label}
                {link.kind === "PAGINA" ? (
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
