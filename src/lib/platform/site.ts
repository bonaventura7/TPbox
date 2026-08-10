/**
 * Origine pubblica del portale, in un punto solo.
 *
 * Il dominio è già cambiato una volta: il progetto è stato rinominato in TPbox e
 * lo slug pubblicato è cambiato con lui, mentre il vecchio indirizzo ha iniziato a
 * restituire 404. I riferimenti sparsi nelle route sono rimasti indietro e hanno
 * continuato a dichiarare come canonica una pagina che non esiste più. Un URL
 * canonico che punta a un 404 non è un refuso: è un'istruzione ai motori di
 * ricerca a deindicizzare la pagina.
 *
 * Da qui in avanti l'origine si scrive qui e in nessun altro punto del codice
 * sorgente. `test/site-origin.test.ts` fa fallire la build se ricompare altrove.
 */
export const SITE_ORIGIN = "https://tp-box.lovable.app";

/** Compone un URL assoluto per `canonical` e `og:url`. `path` inizia con "/". */
export function canonicalUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`canonicalUrl richiede un percorso assoluto, ricevuto: ${path}`);
  }
  return path === "/" ? SITE_ORIGIN : `${SITE_ORIGIN}${path.replace(/\/+$/, "")}`;
}

/** Repository pubblico del progetto: anch'esso rinominato in TPbox. */
export const REPO_URL = "https://github.com/bonaventura7/TPbox";
