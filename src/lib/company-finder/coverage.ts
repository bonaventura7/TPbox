// ---------- Copertura reale, vista derivata dalla macchina a stati ----------
// La classificazione vive in `document-access.ts` (DOCUMENT_AVAILABLE /
// LIST_ONLY / SOURCE_RESTRICTED / REGISTRY_ONLY, con la prova per voce).
// Questo modulo espone le tre viste storiche usate dal resto del codice,
// derivate dalla stessa tabella: nessuna lista duplicata che possa divergere.
//
//  A. AUTOMATICO — il server dell'Osservatorio scarica documento o valori e li
//     mostra in pagina. Nessun clic, nessuna chiave.
//  B. CONSULTAZIONE — il bilancio è gratuito ma il registro non è
//     interrogabile da un server (WAF, sessione, CAPTCHA, condizioni d'uso).
//     La pagina ufficiale viene incorporata quando possibile, altrimenti
//     offerta come link con il percorso guidato.
//  C. NESSUNA FONTE GRATUITA — il documento costa. Questi paesi NON sono
//     offerti dal tool: promettere una copertura che non c'è è peggio che
//     dichiararne l'assenza.

import { DOCUMENT_ACCESS, documentTierFor, isOffered, type AccessInfo } from "./document-access";

function isosOf(tier: AccessInfo["tier"]): string[] {
  return Object.entries(DOCUMENT_ACCESS)
    .filter(([, info]) => info.tier === tier)
    .map(([iso]) => iso);
}

/** Livello A: bilancio recuperato dal server e mostrato in pagina. */
export const AUTO_ISOS = isosOf("document") as readonly string[];

/**
 * Livello B: bilancio gratuito, consultazione ufficiale (incorporata o da
 * aprire nel browser). L'URL è la pagina da cui si arriva al documento
 * depositato; la `label` è l'etichetta ufficiale del portale.
 */
export const CONSULT_PAGES: Record<string, { url: string; label: string }> = Object.fromEntries(
  Object.entries(DOCUMENT_ACCESS)
    .filter(([, info]) => (info.tier === "list" || info.tier === "restricted") && info.consult)
    .map(([iso, info]) => [iso, { url: info.consult!.url, label: info.consult!.label }]),
);

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
