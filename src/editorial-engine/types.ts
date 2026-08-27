/**
 * Editorial Engine v2 — modello del draft redazionale.
 *
 * Modulo puro e server-side: nessun accesso a rete, nessun secret, nessuna
 * dipendenza da React. Il draft prodotto NON è pubblicabile per costruzione:
 * lo stato di ingresso in pipeline resta DRAFT e la pubblicazione è una
 * decisione separata (news-publish).
 */

/** Tipo di notizia: determina la struttura attesa e la densità minima. */
export const NEWS_TYPES = [
  "REGULATORY_UPDATE",
  "APA",
  "COURT_CASE",
  "OECD",
  "EU",
  "TAX_AUTHORITY",
  "PILLAR_TWO",
] as const;
export type NewsType = (typeof NEWS_TYPES)[number];

export const DRAFT_CATEGORIES = ["TP", "VAT", "Pillar Two", "Anti-Avoidance"] as const;
export type DraftCategory = (typeof DRAFT_CATEGORIES)[number];

/** Natura del riferimento: la fonte primaria è il documento, non il commento. */
export type SourceRole = "PRIMARY" | "SECONDARY";

export interface DraftSource {
  /** Etichetta istituzionale della fonte (ente, corte, amministrazione). */
  label: string;
  url: string;
  role: SourceRole;
}

/** Box tecnico/normativo/pratico: sta nel corpo, non sostituisce l'analisi. */
export type DraftBoxKind = "NORMATIVA" | "TECNICO" | "PRATICA" | "ATTENZIONE";

export interface DraftBox {
  kind: DraftBoxKind;
  title: string;
  /** Righe già in markdown minimale (paragrafi o elenchi). */
  lines: string[];
}

export interface EditorialDraft {
  newsType: NewsType;
  category: DraftCategory;
  title: string;
  slug: string;
  excerpt: string;
  bodyMd: string;
  sources: DraftSource[];
  boxes: DraftBox[];
  takeaways: string[];
  normativeReferences: string[];
}

export type DraftValidation<T> = { ok: true; value: T } | { ok: false; reasons: string[] };
