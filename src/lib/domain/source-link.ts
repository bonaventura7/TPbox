/**
 * Terzo livello della sezione Attualità: il documento ufficiale su cui
 * l'articolo è basato.
 *
 * Tre regole, tutte nate da difetti osservati in pagina:
 *
 * 1. l'etichetta del rimando è il **titolo del documento**, non una dizione
 *    generica e non il rango della fonte. «Fonte primaria» dice al lettore
 *    come classifichiamo il documento; il titolo gli dice che cosa apre;
 * 2. si dichiara se il rimando scarica un file o apre una pagina, e lo si
 *    deduce dalla risorsa. «Scarica il PDF» scritto sopra una pagina HTML era
 *    una descrizione falsa, e lo era anche il contrario;
 * 3. la stessa risorsa non compare due volte. Nella voce indiana `originalUrl`
 *    e `pdfUrl` contengono la stessa URL: due pulsanti diversi aprivano lo
 *    stesso file.
 */
import type { NewsItem } from "./types";

/** DOCUMENTO è il documento ufficiale; PAGINA è la pagina che lo ospita. */
export type SourceLinkKind = "DOCUMENTO" | "PAGINA";

export interface SourceLink {
  kind: SourceLinkKind;
  url: string;
  /** Testo mostrato al lettore: titolo del documento quando è dichiarato. */
  label: string;
  /** Vero quando la risorsa è un file scaricabile e non una pagina. */
  download: boolean;
}

/** Etichette di ricaduta, usate solo quando il titolo non è dichiarato. */
const FALLBACK_LABEL = {
  DOCUMENTO: "Documento ufficiale",
  PAGINA: "Pagina ufficiale",
} as const;

/** Solo http e https: uno schema diverso non è un documento consultabile. */
export function safeUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Riconosce il file scaricabile. L'estensione non basta: il rapporto APA
 * indiano vive su `.../apa-report2025-26-2-pdf`, senza punto. Il suffisso vale
 * solo a fine percorso, così `/pdf-viewer/istruzioni` resta una pagina.
 */
export function isPdfUrl(raw: string | null | undefined): boolean {
  const url = safeUrl(raw);
  if (!url) return false;
  const path = url.pathname.replace(/\/+$/, "");
  return /\.pdf$/i.test(path) || /[-_/]pdf$/i.test(path);
}

/** Forma canonica per il confronto: la barra finale non fa una risorsa diversa. */
export function canonicalUrl(url: URL): string {
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}${url.search}`;
}

/**
 * Catena dei rimandi, in ordine di utilità per il lettore: prima il documento,
 * poi la pagina che lo ospita. Lista vuota significa che nessuna fonte
 * consultabile è disponibile, e la pagina lo dichiara invece di tacerlo.
 *
 * `pdfUrl` è la colonna che contiene il documento: quando è valorizzata il
 * primo rimando è il documento, quale che sia la forma della sua URL. Il
 * flag `download` resta però dedotto dalla risorsa, perché un documento
 * ufficiale può vivere su una pagina e in quel caso non si scarica nulla.
 */
export function buildSourceLinks(
  item: Pick<NewsItem, "originalUrl" | "pdfUrl" | "sourceDocumentTitle">,
): SourceLink[] {
  const documentUrl = safeUrl(item.pdfUrl);
  const documentKey = documentUrl ? canonicalUrl(documentUrl) : null;
  const title = item.sourceDocumentTitle?.trim();

  const links: SourceLink[] = [];
  const seen = new Set<string>();

  const add = (raw: string | null | undefined) => {
    const url = safeUrl(raw);
    if (!url) return;
    const key = canonicalUrl(url);
    if (seen.has(key)) return;
    seen.add(key);

    // È il documento quando arriva dalla colonna dedicata, quando la sua URL
    // è un file scaricabile, oppure quando è l'unico rimando disponibile e il
    // titolo del documento è dichiarato: in quel caso la pagina istituzionale
    // *è* il documento, e chiamarla altrimenti sposterebbe l'attenzione.
    const isDocument =
      key === documentKey || isPdfUrl(url.toString()) || (!documentKey && Boolean(title));
    const kind: SourceLinkKind = isDocument ? "DOCUMENTO" : "PAGINA";

    const label =
      kind === "DOCUMENTO" && title
        ? title
        : kind === "PAGINA" && documentKey
          ? "Pagina che ospita il documento"
          : FALLBACK_LABEL[kind];

    links.push({ kind, url: url.toString(), label, download: isPdfUrl(url.toString()) });
  };

  add(item.pdfUrl);
  add(item.originalUrl);

  // Ordine stabile per il lettore: il documento viene prima della pagina che
  // lo ospita, quale che sia la colonna da cui è arrivato.
  return links.sort((a, b) => Number(a.kind !== "DOCUMENTO") - Number(b.kind !== "DOCUMENTO"));
}
