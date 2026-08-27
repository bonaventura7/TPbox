/**
 * Terzo livello: il documento ufficiale dell'articolo.
 *
 * Sta nella pagina articolo e non solo nella card, perché è il documento su cui
 * l'articolo è basato, non un'alternativa alla lettura. Il rimando porta il
 * titolo del documento: al lettore serve sapere che cosa apre, non come
 * classifichiamo la fonte. Etichetta, tipo e deduplica vivono in
 * `buildSourceLinks`, qui si rende soltanto l'esito.
 */
import { Download, ExternalLink, FileText, ShieldAlert } from "lucide-react";

import type { NewsItem } from "@/lib/domain/types";
import { buildSourceLinks } from "@/lib/domain/source-link";

export function SourceBlock({ item }: { item: NewsItem }) {
  const links = buildSourceLinks(item);

  return (
    <section
      aria-labelledby="documento-ufficiale"
      className="mt-10 border border-border bg-surface p-5 sm:p-6"
    >
      <h2 id="documento-ufficiale" className="font-serif text-lg">
        Documento
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {item.sourceName}
        {item.country ? ` · ${item.country}` : ""}
      </p>

      {links.length === 0 ? (
        <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Documento ufficiale non disponibile: l&apos;indirizzo indicato non è un collegamento
            consultabile. L&apos;articolo resta leggibile, ma il rimando non viene mostrato finché
            non è verificabile.
          </span>
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {links.map((link) => (
            <li key={link.url}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={
                  link.kind === "DOCUMENTO"
                    ? "group inline-flex min-h-11 max-w-full items-start gap-2 border border-border bg-secondary px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary/80"
                    : "inline-flex min-h-11 items-center gap-2 text-sm font-medium text-petrol underline underline-offset-4"
                }
              >
                {link.kind === "DOCUMENTO" ? (
                  link.download ? (
                    <Download className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <FileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  )
                ) : null}
                <span className="min-w-0">
                  <span className="block">{link.label}</span>
                  {link.kind === "DOCUMENTO" ? (
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {link.download ? "Scarica il documento" : "Apri il documento"}
                    </span>
                  ) : null}
                </span>
                {link.kind === "PAGINA" ? (
                  <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
