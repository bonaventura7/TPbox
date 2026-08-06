/**
 * Amount B – Tabelle di riferimento
 *
 * Fonte: OECD, "Pricing Automation Tool for the Simplified and Streamlined
 * Approach" (February 2026 version), fogli "Data Table as of ...",
 * intervalli S8:T22 (scala rating), V8:W12 (classificazione OAS) e
 * V25:W59 (prodotti).
 *
 * Verificato in fase di estrazione: questi tre intervalli sono identici nelle
 * data table di marzo 2024, dicembre 2024 e gennaio 2026. Sono quindi
 * condivisi tra le versioni, non duplicati per versione. Se una futura data
 * table dovesse modificarli, andranno versionati come le giurisdizioni.
 */

import type { CreditRatingBand, FactorIntensity, ProductRecord } from "./types";

/**
 * Scala rating sovrano -> net risk adjustment, ai fini della Section 5.3.
 *
 * Nota: nel workbook OCSE la formula di lookup del NRA punta in modo fisso al
 * foglio "Data Table as of December 2024" anche nella versione February 2026.
 * Poiché i valori coincidono nelle tre data table, oggi la cosa non produce
 * differenze di calcolo. Questa implementazione non replica il riferimento
 * fisso: lega la scala alla versione del dataset selezionata, così un futuro
 * aggiornamento della scala non verrebbe ignorato in silenzio.
 */
export const CREDIT_RATING_BANDS: readonly CreditRatingBand[] = [
  { rating: "-", netRiskAdjustment: 0 },
  { rating: "A- or higher", netRiskAdjustment: 0 },
  { rating: "BBB+", netRiskAdjustment: 0 },
  { rating: "BBB", netRiskAdjustment: 0 },
  { rating: "BBB-", netRiskAdjustment: 0.003 },
  { rating: "BB+", netRiskAdjustment: 0.007 },
  { rating: "BB", netRiskAdjustment: 0.012 },
  { rating: "BB-", netRiskAdjustment: 0.018 },
  { rating: "B+", netRiskAdjustment: 0.028 },
  { rating: "B", netRiskAdjustment: 0.038 },
  { rating: "B-", netRiskAdjustment: 0.049 },
  { rating: "CCC+", netRiskAdjustment: 0.059 },
  { rating: "CCC", netRiskAdjustment: 0.075 },
  { rating: "CCC- or lower", netRiskAdjustment: 0.086 },
  { rating: "No Credit Rating", netRiskAdjustment: 0.041 },
];

/**
 * Classificazione della factor intensity ai fini delle fasce cap della
 * Section 5.2. A -> High OAS; B e C -> Medium OAS; D ed E -> Low OES.
 */
export type OeccBand = "High OAS" | "Medium OAS" | "Low OES";

export const OECC_BAND_BY_FACTOR_INTENSITY: Readonly<Record<FactorIntensity, OeccBand>> = {
  A: "High OAS",
  B: "Medium OAS",
  C: "Medium OAS",
  D: "Low OES",
  E: "Low OES",
};

/**
 * Prodotti e industry grouping di appartenenza, dalla sezione definizioni
 * della guidance. Serve a far scegliere all'utente un prodotto invece di un
 * numero di gruppo.
 */
export const PRODUCTS: readonly ProductRecord[] = [
  { product: "agricultural supplies", industryGrouping: 2 },
  { product: "alcohol and tobacco", industryGrouping: 2 },
  { product: "animal feeds", industryGrouping: 2 },
  { product: "clothing footwear and other apparel", industryGrouping: 2 },
  { product: "construction materials and supplies", industryGrouping: 1 },
  { product: "consumer electronics", industryGrouping: 2 },
  { product: "cosmetics", industryGrouping: 2 },
  { product: "dyes", industryGrouping: 2 },
  { product: "electrical components and consumables", industryGrouping: 2 },
  { product: "furniture", industryGrouping: 2 },
  { product: "grocery", industryGrouping: 1 },
  { product: "health and wellbeing products", industryGrouping: 2 },
  { product: "home and office supplies", industryGrouping: 2 },
  { product: "home appliances", industryGrouping: 2 },
  { product: "household consumables", industryGrouping: 1 },
  { product: "industrial components miscellaneous supplies", industryGrouping: 3 },
  {
    product: "industrial machinery including industrial and agricultural vehicles",
    industryGrouping: 3,
  },
  { product: "industrial tools", industryGrouping: 3 },
  { product: "IT hardware and components", industryGrouping: 2 },
  { product: "jewellery", industryGrouping: 2 },
  { product: "lubricants", industryGrouping: 2 },
  { product: "medical machinery", industryGrouping: 3 },
  { product: "mixed products", industryGrouping: 2 },
  { product: "products and components not listed in group 1 or 3", industryGrouping: 2 },
  { product: "new and used domestic vehicles", industryGrouping: 2 },
  { product: "paper and packaging", industryGrouping: 2 },
  { product: "perishable foods", industryGrouping: 1 },
  { product: "pet foods", industryGrouping: 2 },
  { product: "pharmaceuticals", industryGrouping: 2 },
  { product: "plastics and chemicals", industryGrouping: 2 },
  { product: "plumbing supplies and metal", industryGrouping: 1 },
  { product: "printed matter", industryGrouping: 2 },
  { product: "textiles hides and furs", industryGrouping: 2 },
  { product: "vehicle parts and supplies", industryGrouping: 2 },
];

/** Industry grouping di un prodotto, per denominazione esatta. */
export function industryGroupingForProduct(product: string) {
  return PRODUCTS.find((p) => p.product === product)?.industryGrouping;
}

/** Net risk adjustment per un rating, `undefined` se il rating non è in scala. */
export function netRiskAdjustmentForRating(rating: string): number | undefined {
  return CREDIT_RATING_BANDS.find((b) => b.rating === rating)?.netRiskAdjustment;
}
