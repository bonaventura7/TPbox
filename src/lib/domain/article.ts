/**
 * Identità dell'articolo redazionale: lo slug e il percorso interno.
 *
 * Il secondo livello della sezione Attualità è una pagina nostra, non un rinvio
 * alla fonte. Perché una card possa puntarci, ogni elemento deve avere un
 * percorso: quando la riga non dichiara uno slug se ne deriva uno stabile da
 * titolo e id, invece di lasciare l'elemento senza collegamento.
 */
import type { NewsItem } from "./types";

/** Massimo della parte derivata dal titolo: lo stesso limite usato dalla pipeline. */
const TITLE_SLUG_MAX = 70;

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Slug dichiarato dalla riga, oppure derivato. La derivazione include l'id
 * perché due provvedimenti possono avere titoli quasi identici: senza il
 * suffisso, due articoli distinti risolverebbero sullo stesso indirizzo.
 */
export function articleSlug(item: Pick<NewsItem, "id" | "title" | "slug">): string {
  const declared = item.slug?.trim();
  if (declared) return declared;

  const base = slugify(item.title).slice(0, TITLE_SLUG_MAX).replace(/-+$/g, "");
  const suffix = slugify(String(item.id)).slice(-8).replace(/^-+/g, "");
  return [base, suffix].filter((part) => part.length > 0).join("-");
}

export function articlePath(item: Pick<NewsItem, "id" | "title" | "slug">): string {
  return `/attualita/articolo/${articleSlug(item)}`;
}
