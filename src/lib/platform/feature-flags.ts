/** Feature flag pubblici: nessun segreto, solo abilitazione di funzionalità UI. */
export const FEATURE_FLAGS = {
  attualitaArchive: true,
  companyFinder: true,
  bilancioFinder: true,
  /** Area PRO simulata: l'accesso reale sarà valutato lato server tramite ruoli. */
  bilancioProAccess: true,
  giurisprudenzaFullText: false,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}
/** Portale interpelli: acquisizione disattivata, fallback su import manuale. */
export const INTERPELLI_FLAGS = {
  acquisitionMode: "MANUAL_IMPORT" as "HTML_WATCH" | "MANUAL_IMPORT" | "DISABLED",
  showTransferPricingFilter: true,
} as const;
