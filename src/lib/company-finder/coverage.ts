// ---------- Copertura reale, vista derivata dalla macchina a stati ----------
// La classificazione vive in `document-access.ts` (DOCUMENT_AVAILABLE /
// LIST_ONLY / SOURCE_RESTRICTED / REGISTRY_ONLY, con la prova per voce).
// Questo modulo espone le viste usate dal resto del codice, derivate dalla
// stessa tabella: nessuna lista duplicata che possa divergere.
//
//  A. AUTOMATICO (AUTO_ISOS) — il server dell'Osservatorio scarica documento
//     o valori e li mostra in pagina. Nessun clic, nessuna chiave.
//  B. CONSULTAZIONE (CONSULT_PAGES) — il bilancio è gratuito e il portale è
//     pubblico: la pagina ufficiale viene incorporata o linkata.
//  B2. SOLO BROWSER (BROWSER_ONLY_PAGES) — il bilancio è gratuito, ma la fonte
//     impone un controllo che va completato dalla persona (verifica anti-bot,
//     login, sessione) e/o rifiuta l'incorporamento (X-Frame-Options: DENY).
//     Si apre in una nuova scheda, con istruzioni: nessun controllo aggirato.
//  C. NESSUNA FONTE GRATUITA (NO_FREE_SOURCE) — il documento costa. Questi
//     paesi NON sono offerti dal tool: promettere una copertura che non c'è è
//     peggio che dichiararne l'assenza.

import { DOCUMENT_ACCESS, documentTierFor, isOffered, type AccessInfo } from "./document-access";

function isosOf(tier: AccessInfo["tier"]): string[] {
  return Object.entries(DOCUMENT_ACCESS)
    .filter(([, info]) => info.tier === tier)
    .map(([iso]) => iso);
}

function pagesOf(tier: AccessInfo["tier"]): Record<string, { url: string; label: string }> {
  return Object.fromEntries(
    Object.entries(DOCUMENT_ACCESS)
      .filter(([, info]) => info.tier === tier && info.consult)
      .map(([iso, info]) => [iso, { url: info.consult!.url, label: info.consult!.label }]),
  );
}

/** Livello A: bilancio recuperato dal server e mostrato in pagina. */
export const AUTO_ISOS = isosOf("document") as readonly string[];

/**
 * Livello B: bilancio gratuito, portale pubblico. L'URL è la pagina da cui si
 * arriva al documento depositato (livello LIST_ONLY della macchina a stati).
 */
export const CONSULT_PAGES: Record<string, { url: string; label: string }> = pagesOf("list");

/**
 * Livello B2: bilancio gratuito ma raggiungibile solo da una persona
 * (livello SOURCE_RESTRICTED): mai in iframe, sempre in una nuova scheda con
 * istruzioni. I due livelli sono disgiunti per costruzione.
 */
export const BROWSER_ONLY_PAGES: Record<string, { url: string; label: string }> =
  pagesOf("restricted");

/**
 * Livello C: il bilancio non è gratuito. Il tool non li offre; la nota dice
 * quanto costa e dove, così l'utente sa dove andare invece di girare a vuoto.
 */
export const NO_FREE_SOURCE: Record<string, string> = Object.fromEntries(
  Object.entries(DOCUMENT_ACCESS)
    .filter(([, info]) => info.tier === "registry")
    .map(([iso, info]) => [iso, info.reason]),
);

/** Il tool copre un paese solo se esiste un canale onesto verso il bilancio. */
export function isCovered(iso: string): boolean {
  return documentTierFor(iso) !== undefined && isOffered(iso);
}
