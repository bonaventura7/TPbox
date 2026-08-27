/**
 * Terzo livello della sezione Attualità: il documento ufficiale su cui
 * l'articolo è basato.
 *
 * Due regole, entrambe nate da difetti osservati in pagina:
 *
 * 1. l'etichetta è derivata dal tipo di risorsa, non è una costante. «Apri la
 *    fonte originale» scritto sopra un PDF era una descrizione falsa;
 * 2. la stessa risorsa non compare due volte. Nella voce indiana `originalUrl`
 *    e `pdfUrl` contengono la stessa URL: due pulsanti diversi aprivano lo
 *    stesso file.
 */
import type { NewsItem } from "./types";

export type SourceLinkKind = "PDF" | "PAGINA";

export interface SourceLink {
  kind: SourceLinkKind;
  url: string;
  label: string;
}

const LABEL: Record<SourceLinkKind, string> = {
  PDF: "Scarica il PDF ufficiale",
  PAGINA: "Apri la pagina ufficiale",
};

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
 * Riconosce il documento scaricabile. L'estensione non basta: il rapporto APA
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
 * Catena dei documenti ufficiali, in ordine di utilità per il lettore: prima il
 * PDF, poi la pagina che lo ospita. Lista vuota significa che nessuna fonte
 * consultabile è disponibile, e la pagina lo dichiara invece di tacerlo.
 */
export function buildSourceLinks(item: Pick<NewsItem, "originalUrl" | "pdfUrl">): SourceLink[] {
  const links: SourceLink[] = [];
  const seen = new Set<string>();

  // Il tipo è sempre dedotto dall'URL, mai dalla colonna che la contiene:
  // promettere «Scarica il PDF» su una pagina è un difetto peggiore del contrario.
  const add = (raw: string | null | undefined) => {
    const url = safeUrl(raw);
    if (!url) return;
    const key = canonicalUrl(url);
    if (seen.has(key)) return;
    seen.add(key);
    const kind: SourceLinkKind = isPdfUrl(url.toString()) ? "PDF" : "PAGINA";
    links.push({ kind, url: url.toString(), label: LABEL[kind] });
  };

  add(item.pdfUrl);
  add(item.originalUrl);

  // Ordine stabile per il lettore: il documento scaricabile viene prima della
  // pagina che lo ospita, quale che sia la colonna da cui è arrivato.
  return links.sort((a, b) => Number(a.kind !== "PDF") - Number(b.kind !== "PDF"));
}
