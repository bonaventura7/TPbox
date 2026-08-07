/**
 * Catalogo Valora Suite: schede documentali con i relativi metadati di fonte.
 * Il catalogo è statico e di sola lettura: nessun dato viene letto dalle fonti a
 * runtime, né dal browser né dal server, e nessuna scheda esegue calcoli.
 */

import type { SourceStatus, ValoraCatalog, ValoraItem, ValoraSource } from "./types";

export const VALORA_CATALOG_VERSION = "valora-catalog.v2";

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

const PROFESSIONAL_NOTICE =
  "Riferimento informativo: i contenuti non costituiscono consulenza fiscale, finanziaria o di valutazione e vanno verificati da un professionista.";

const PERMITTED_USE =
  "Citazione del riferimento primario con collegamento all'URL canonico. Nessuna copia, nessun iframe, nessuna acquisizione automatica.";

/**
 * Registry di fonti primarie: solo enti esterni, autorevoli e pertinenti al
 * perimetro della scheda che le cita. Nessuna fonte interna, sintetica o demo.
 */
const SOURCES: readonly ValoraSource[] = [
  {
    id: "src-oecd-tp",
    tier: "PRIMARY",
    primarySourceName: "OCSE — documentazione ufficiale su transfer pricing e valutazione",
    canonicalUrl: "https://www.oecd.org/tax/transfer-pricing/",
    sourceDateOrVersion: "2026-02",
    lastVerifiedAt: "2026-07-15",
    status: "VERIFIED",
    permittedUse: PERMITTED_USE,
    limitations:
      "Il riferimento inquadra il perimetro metodologico delle schede; non fornisce parametri operativi.",
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
      "Verifica manuale non registrata: la fonte è citata come riferimento normativo e non alimenta contenuti.",
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
      "Nessun dato è importato dalla fonte: le schede restano documentali e non espongono serie storiche.",
    professionalNotice: PROFESSIONAL_NOTICE,
  },
] as const;

const ITEMS: readonly ValoraItem[] = [
  {
    id: "valora-wacc",
    kind: "TOOL",
    category: "COST_OF_CAPITAL",
    title: "WACC — costo medio ponderato del capitale",
    description:
      "Perimetro metodologico del costo del capitale: relazione fra costo dell'equity, costo del debito e struttura finanziaria, con la catena di derivazione in chiaro.",
    status: "IN_VALIDATION",
    route: "/tool/valora/wacc",
    sourceId: "src-oecd-tp",
    version: null,
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
      "Relazione fra beta unlevered di settore e beta levered dell'entità in funzione di leva finanziaria e aliquota fiscale.",
    status: "PLANNED",
    route: null,
    sourceId: "src-oecd-tp",
    version: null,
    lastVerifiedAt: null,
    formulaChain: [
      "Beta levered = beta unlevered × (1 + (1 − t) × D/E)",
      "Beta unlevered = beta levered / (1 + (1 − t) × D/E)",
    ],
    keywords: ["beta", "levered", "unlevered", "leva finanziaria"],
  },
  {
    id: "valora-crp",
    kind: "DATASET",
    category: "RISK_PREMIA",
    title: "Country Risk Premium",
    description:
      "Perimetro documentale del premio per il rischio paese come componente additiva del costo dell'equity. Nessuna serie è pubblicata nel catalogo.",
    status: "PLANNED",
    route: null,
    sourceId: "src-bancaditalia",
    version: null,
    lastVerifiedAt: null,
    formulaChain: ["CRP = spread sovrano × (volatilità equity / volatilità obbligazionaria)"],
    keywords: ["country risk", "crp", "rischio paese", "spread sovrano"],
  },
  {
    id: "valora-credit-spread",
    kind: "DATASET",
    category: "CREDIT",
    title: "Credit spread e costo del debito",
    description:
      "Perimetro documentale della stima del costo del debito in assenza di rating esterno. Nessuna tabella di spread è pubblicata nel catalogo.",
    status: "PLANNED",
    route: null,
    sourceId: "src-bancaditalia",
    version: null,
    lastVerifiedAt: null,
    formulaChain: ["Interest coverage ratio → classe di rischio → spread"],
    keywords: ["credit spread", "interest coverage", "costo del debito", "rating"],
  },
  {
    id: "valora-dcf-fcff",
    kind: "TOOL",
    category: "VALUATION",
    title: "DCF — Free Cash Flow to Firm",
    description:
      "Perimetro metodologico dell'attualizzazione dei flussi di cassa disponibili per l'impresa, con valore terminale.",
    status: "PLANNED",
    route: null,
    sourceId: "src-oecd-tp",
    version: null,
    lastVerifiedAt: "2026-07-15",
    formulaChain: [
      "FCFF = EBIT × (1 − t) + ammortamenti − capex − Δ capitale circolante",
      "Enterprise value = Σ FCFF_t / (1 + WACC)^t + valore terminale attualizzato",
    ],
    keywords: ["dcf", "fcff", "enterprise value", "valore terminale"],
  },
  {
    id: "valora-eu-references",
    kind: "RESOURCE",
    category: "DATASET",
    title: "Riferimenti istituzionali europei",
    description:
      "Raccolta dei riferimenti istituzionali europei utili a inquadrare l'uso dei modelli finanziari nelle analisi fiscali e di transfer pricing.",
    status: "PLANNED",
    route: null,
    sourceId: "src-ec-taxation",
    version: null,
    lastVerifiedAt: null,
    formulaChain: [],
    keywords: ["unione europea", "riferimenti", "valutazione", "transfer pricing"],
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
  PLANNED: "pianificato",
  IN_VALIDATION: "in validazione",
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
