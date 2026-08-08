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
 * Default sicuro: mock. Il repo reale si attiva solo con VITE_USE_REAL_REPO="true".
 * La variabile non è un segreto: abilita soltanto la sorgente dati.
 */
export function useRealNewsRepo(): boolean {
  return import.meta.env["VITE_USE_REAL_REPO"] === "true";
}
/** Portale interpelli: acquisizione disattivata, fallback su import manuale. */
export const INTERPELLI_FLAGS = {
  acquisitionMode: "MANUAL_IMPORT" as "HTML_WATCH" | "MANUAL_IMPORT" | "DISABLED",
  showTransferPricingFilter: true,
} as const;
