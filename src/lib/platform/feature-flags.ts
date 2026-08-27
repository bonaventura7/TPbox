/** Feature flag pubblici: nessun segreto, solo abilitazione di funzionalità UI. */
export const FEATURE_FLAGS = {
  attualitaArchive: true,
  companyFinder: true,
  /** Area PRO simulata: l'accesso reale sarà valutato lato server tramite ruoli. */
  bilancioProAccess: true,
  giurisprudenzaFullText: false,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}

/**
 * Attualità: repository reale (database TP Box) contro repository mock.
 *
 * Il default è il repo reale, perché il database contiene articoli pubblicati
 * con fonte primaria verificata: tenere il mock come default significherebbe
 * mostrare dati demo accanto a contenuti reali già disponibili.
 *
 * `VITE_USE_REAL_REPO="false"` è il kill-switch: riporta la sezione ai dati
 * demo senza un deploy di codice. Qualunque altro valore, variabile assente
 * compresa, seleziona il repo reale.
 */
export function useRealNewsRepo(): boolean {
  return import.meta.env["VITE_USE_REAL_REPO"] !== "false";
}
/** Portale interpelli: acquisizione disattivata, fallback su import manuale. */
export const INTERPELLI_FLAGS = {
  acquisitionMode: "MANUAL_IMPORT" as "HTML_WATCH" | "MANUAL_IMPORT" | "DISABLED",
  showTransferPricingFilter: true,
} as const;
