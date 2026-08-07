/**
 * Catalogo Valora Suite: tool, dataset e risorse con i relativi metadati di fonte.
 * I valori numerici usati dai moduli sono sintetici e marcati DEMO: nessun dato
 * viene letto dalle fonti a runtime, né dal browser né dal server.
 */

import type {
  InternalDiscoveryReference,
  SourceStatus,
  ValoraCatalog,
  ValoraItem,
  ValoraSource,
} from "./types";

export const VALORA_CATALOG_VERSION = "valora-catalog.v1";

/** Host istituzionali ammessi per gli URL canonici delle fonti primarie. */
export const VALORA_ALLOWED_HOSTS: readonly string[] = [
  "www.oecd.org",
  "taxation-customs.ec.europa.eu",
  "eur-lex.europa.eu",
  "www.bancaditalia.it",
  "www.agenziaentrate.gov.it",
] as const;

/** Soglia oltre la quale una verifica è considerata invecchiata. */
export const VALORA_VERIFICATION_MAX_AGE_DAYS = 180;

/** Stati ammessi per una fonte primaria. */
export const VALORA_SOURCE_STATUSES: readonly SourceStatus[] = [
  "VERIFIED",
  "PENDING_VERIFICATION",
  "STALE",
  "UNAVAILABLE",
] as const;

/** Rotte Valora effettivamente esistenti: usate per validare i percorsi del catalogo. */
export const VALORA_KNOWN_ROUTES: readonly string[] = ["/tool/valora", "/tool/valora/wacc"] as const;

const PROFESSIONAL_NOTICE =
  "Riferimento informativo: i contenuti non costituiscono consulenza fiscale, finanziaria o di valutazione e vanno verificati da un professionista.";

const PERMITTED_USE =
  "Citazione del riferimento primario con collegamento all'URL canonico. Nessuna copia, nessun iframe, nessuna acquisizione automatica.";

const SOURCES: readonly ValoraSource[] = [
  {
    id: "src-oecd-tp",
    tier: "PRIMARY",
    primarySourceName: "OCSE — Transfer Pricing (documentazione ufficiale)",
    canonicalUrl: "https://www.oecd.org/tax/transfer-pricing/",
    sourceDateOrVersion: "2026-02",
    lastVerifiedAt: "2026-07-15",
    status: "VERIFIED",
    permittedUse: PERMITTED_USE,
    limitations:
      "Il riferimento inquadra la metodologia; non fornisce parametri numerici ai moduli di calcolo.",
    professionalNotice: PROFESSIONAL_NOTICE,
  },
  {
    id: "src-ec-taxation",
    tier: "PRIMARY",
    primarySourceName: "Commissione europea — Taxation and Customs Union",
    canonicalUrl: "https://taxation-customs.ec.europa.eu/",
    sourceDateOrVersion: null,
    lastVerifiedAt: null,
    status: "PENDING_VERIFICATION",
    permittedUse: PERMITTED_USE,
    limitations:
      "Verifica manuale non registrata: la fonte non alimenta alcun calcolo finché non è verificata.",
    professionalNotice: PROFESSIONAL_NOTICE,
  },
  {
    id: "src-bancaditalia",
    tier: "PRIMARY",
    primarySourceName: "Banca d'Italia — statistiche e pubblicazioni ufficiali",
    canonicalUrl: "https://www.bancaditalia.it/statistiche/",
    sourceDateOrVersion: null,
    lastVerifiedAt: "2026-07-15",
    status: "STALE",
    permittedUse: PERMITTED_USE,
    limitations:
      "Nessun dato è importato: i valori mostrati nei moduli restano sintetici e dimostrativi.",
    professionalNotice: PROFESSIONAL_NOTICE,
  },
  {
    id: "src-methodology",
    tier: "PRIMARY",
    primarySourceName: "Metodologia interna Valora (dataset sintetico DEMO)",
    canonicalUrl: "https://www.oecd.org/tax/transfer-pricing/",
    sourceDateOrVersion: "2026-06-30",
    lastVerifiedAt: "2026-07-15",
    status: "VERIFIED",
    permittedUse:
      "Valori sintetici costruiti dalla redazione per finalità dimostrative, con quadro metodologico istituzionale.",
    limitations: "I valori non rappresentano dati di mercato e non sono utilizzabili in produzione.",
    professionalNotice: PROFESSIONAL_NOTICE,
  },
] as const;

/**
 * Discovery interna: elenco non esposto in UI e privo di riferimenti nominativi.
 * Serve solo a documentare che l'individuazione manuale non alimenta i dati.
 */
export const VALORA_INTERNAL_DISCOVERY: readonly InternalDiscoveryReference[] = [
  {
    id: "discovery-cost-of-capital",
    exposed: false,
    feedsData: false,
    scopeNote:
      "Ricognizione bibliografica interna sul costo del capitale: nessun dato importato, nessun riferimento esposto.",
  },
] as const;

const ITEMS: readonly ValoraItem[] = [
  {
    id: "valora-wacc",
    kind: "TOOL",
    category: "COST_OF_CAPITAL",
    title: "WACC — costo medio ponderato del capitale",
    description:
      "Composizione del costo del capitale a partire da costo dell'equity, costo del debito e struttura finanziaria, con la catena di derivazione in chiaro.",
    status: "DEMO",
    mode: "demo",
    route: "/tool/valora/wacc",
    sourceId: "src-methodology",
    version: "wacc-model.v1",
    checksum: "wacc-v1-3f9c2a",
    lastVerifiedAt: "2026-07-15",
    formulaChain: [
      "WACC = E/(D+E) × Ke + D/(D+E) × Kd × (1 − t)",
      "Ke = risk free + beta levered × equity risk premium + country risk premium",
      "Kd = risk free + credit spread",
    ],
    keywords: ["wacc", "costo del capitale", "ke", "kd", "struttura finanziaria"],
  },
  {
    id: "valora-beta",
    kind: "TOOL",
    category: "COST_OF_CAPITAL",
    title: "Beta levered e unlevered",
    description:
      "Passaggio tra beta di settore unlevered e beta levered dell'entità, in funzione di leva finanziaria e aliquota fiscale.",
    status: "DEMO",
    mode: "demo",
    route: null,
    sourceId: "src-methodology",
    version: null,
    checksum: null,
    lastVerifiedAt: null,
    formulaChain: [
      "Beta levered = beta unlevered × (1 + (1 − t) × D/E)",
      "Beta unlevered = beta levered / (1 + (1 − t) × D/E)",
    ],
    keywords: ["beta", "levered", "unlevered", "hamada"],
  },
  {
    id: "valora-crp",
    kind: "DATASET",
    category: "RISK_PREMIA",
    title: "Country Risk Premium",
    description:
      "Premio per il rischio paese per giurisdizione, da usare come componente additiva del costo dell'equity.",
    status: "STALE",
    mode: "demo",
    route: null,
    sourceId: "src-bancaditalia",
    version: null,
    checksum: null,
    lastVerifiedAt: null,
    formulaChain: ["CRP = spread sovrano × (volatilità equity / volatilità obbligazionaria)"],
    keywords: ["country risk", "crp", "rischio paese", "spread sovrano"],
  },
  {
    id: "valora-credit-spread",
    kind: "DATASET",
    category: "CREDIT",
    title: "Credit Spread sintetico",
    description:
      "Spread per fasce di copertura degli oneri finanziari, usato per stimare il costo del debito in assenza di rating esterno.",
    status: "DEMO",
    mode: "demo",
    route: null,
    sourceId: "src-methodology",
    version: "credit-spread.v1",
    checksum: "cs-v1-a71b04",
    lastVerifiedAt: "2026-07-15",
    formulaChain: ["Interest coverage ratio → rating sintetico → spread"],
    keywords: ["credit spread", "rating sintetico", "interest coverage", "costo del debito"],
  },
  {
    id: "valora-dcf-fcff",
    kind: "TOOL",
    category: "VALUATION",
    title: "DCF — Free Cash Flow to Firm",
    description:
      "Attualizzazione dei flussi di cassa disponibili per l'impresa con valore terminale, coerente con il WACC calcolato nel modulo dedicato.",
    status: "PLANNED",
    mode: "demo",
    route: null,
    sourceId: "src-methodology",
    version: null,
    checksum: null,
    lastVerifiedAt: "2026-07-15",
    formulaChain: [
      "FCFF = EBIT × (1 − t) + ammortamenti − capex − Δ capitale circolante",
      "Enterprise value = Σ FCFF_t / (1 + WACC)^t + valore terminale attualizzato",
    ],
    keywords: ["dcf", "fcff", "enterprise value", "valore terminale"],
  },
  {
    id: "valora-oecd-guidance",
    kind: "RESOURCE",
    category: "DATASET",
    title: "Riferimenti OCSE sui metodi di valutazione",
    description:
      "Raccolta dei riferimenti OCSE utili a inquadrare l'uso dei modelli finanziari nelle analisi di transfer pricing.",
    status: "LIVE",
    mode: "live",
    route: null,
    sourceId: "src-oecd-tp",
    version: "oecd-refs.2026-02",
    checksum: null,
    lastVerifiedAt: "2026-07-15",
    formulaChain: [],
    keywords: ["ocse", "linee guida", "valutazione", "intangibili"],
  },
] as const;

export const valoraCatalog: ValoraCatalog = {
  version: VALORA_CATALOG_VERSION,
  generatedAt: "2026-07-15",
  sources: SOURCES,
  items: ITEMS,
};

export function getSource(sourceId: string): ValoraSource | null {
  return valoraCatalog.sources.find((source) => source.id === sourceId) ?? null;
}

export function getItem(itemId: string): ValoraItem | null {
  return valoraCatalog.items.find((item) => item.id === itemId) ?? null;
}

export const CATEGORY_LABEL: Record<ValoraItem["category"], string> = {
  COST_OF_CAPITAL: "Costo del capitale",
  RISK_PREMIA: "Premi per il rischio",
  CREDIT: "Rischio di credito",
  VALUATION: "Valutazione",
  DATASET: "Riferimenti e dataset",
};

export const STATUS_LABEL: Record<ValoraItem["status"], string> = {
  LIVE: "operativo",
  DEMO: "dimostrativo",
  STALE: "da verificare",
  UNAVAILABLE: "non disponibile",
  PLANNED: "in sviluppo",
};

/** Filtro puro sul catalogo: usato dalla dashboard e dai test. */
export function filterItems(
  items: readonly ValoraItem[],
  criteria: { query?: string; category?: string; status?: string },
): readonly ValoraItem[] {
  const query = (criteria.query ?? "").trim().toLowerCase();
  return items.filter((item) => {
    if (criteria.category && criteria.category !== "all" && item.category !== criteria.category) {
      return false;
    }
    if (criteria.status && criteria.status !== "all" && item.status !== criteria.status) {
      return false;
    }
    if (query.length === 0) return true;
    const haystack = [item.title, item.description, ...item.keywords].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}
