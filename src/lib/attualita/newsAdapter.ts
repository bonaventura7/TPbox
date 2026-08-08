import type { NewsCategory, NewsItem, Topic, WorkflowState } from "../domain/types";

export type PublishedNewsRow = {
  id: string;
  it_title: string | null;
  it_summary: string | null;
  it_content: string | null;
  it_references: unknown;
  primary_source_url: string;
  source_name: string | null;
  category: "TP" | "VAT" | "P2" | "AA" | string;
  country: string | null;
  status: string;
  published_at: string | null;
  fetched_at: string | null;
  disclaimer: string | null;
  needs_review: boolean | null;
  ai_metadata: Record<string, unknown> | null;
};

const COUNTRY_NAMES: Record<string, string> = {
  AT: "Austria",
  BE: "Belgio",
  BG: "Bulgaria",
  HR: "Croazia",
  CY: "Cipro",
  CZ: "Repubblica Ceca",
  DK: "Danimarca",
  EE: "Estonia",
  FI: "Finlandia",
  FR: "Francia",
  DE: "Germania",
  GR: "Grecia",
  HU: "Ungheria",
  IE: "Irlanda",
  IT: "Italia",
  LV: "Lettonia",
  LT: "Lituania",
  LU: "Lussemburgo",
  MT: "Malta",
  NL: "Paesi Bassi",
  PL: "Polonia",
  PT: "Portogallo",
  RO: "Romania",
  SK: "Slovacchia",
  SI: "Slovenia",
  ES: "Spagna",
  SE: "Svezia",
  GB: "Regno Unito",
  UK: "Regno Unito",
  US: "Stati Uniti",
  IN: "India",
  SG: "Singapore",
  CN: "Cina",
  JP: "Giappone",
  AU: "Australia",
  CA: "Canada",
};

const EU = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
]);

const OECD = new Set([
  "AT",
  "AU",
  "BE",
  "CA",
  "CL",
  "CO",
  "CR",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IS",
  "IE",
  "IL",
  "IT",
  "JP",
  "KR",
  "LV",
  "LT",
  "LU",
  "MX",
  "NL",
  "NZ",
  "NO",
  "PL",
  "PT",
  "SK",
  "SI",
  "ES",
  "SE",
  "CH",
  "TR",
  "GB",
  "US",
]);

const TOPIC_HINTS: Array<[Topic, RegExp]> = [
  ["Intangibili", /intangibil|royalt|marchi|brevetti/i],
  ["Servizi infragruppo", /servizi infragruppo|intragroup services/i],
  ["Documentazione", /master.?file|local.?file|documentazione/i],
  ["APA e MAP", /\bAPA\b|\bMAP\b|accordo preventivo|mutual agreement/i],
  ["Contenzioso", /contenzioso|controvers|accertamento|court|tribunal/i],
];

function mapCategory(category: string): NewsCategory {
  switch (category) {
    case "VAT":
      return "VAT";
    case "P2":
      return "Pillar Two";
    case "AA":
      return "Anti-Avoidance";
    default:
      return "Transfer Pricing";
  }
}

function mapGeo(country: string | null) {
  const code = country?.toUpperCase() ?? "";
  if (code === "IT") return "ITALIA" as const;
  if (EU.has(code)) return "UE" as const;
  if (OECD.has(code)) return "OCSE" as const;
  return "GLOBALE" as const;
}

function mapTopic(category: string, title: string, summary: string): Topic {
  if (category === "P2") return "Pillar Two";
  if (category !== "TP") return "Metodi e comparabili";
  const text = `${title} ${summary}`;
  return TOPIC_HINTS.find(([, pattern]) => pattern.test(text))?.[0] ?? "Metodi e comparabili";
}

function mapWorkflowState(status: string): WorkflowState {
  return status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
}

export function mapPublishedNewsRow(row: PublishedNewsRow): NewsItem {
  const title = row.it_title?.trim() || "Aggiornamento istituzionale";
  const summary = row.it_summary?.trim() || "Aggiornamento da fonte istituzionale.";
  const countryCode = row.country?.toUpperCase() ?? "";

  return {
    id: row.id,
    title,
    summary,
    sourceId: row.source_name ?? "institutional",
    sourceName: row.source_name ?? "Fonte istituzionale",
    sourceKind: "ISTITUZIONALE",
    sourceTier: "PRIMARY",
    originalDate: row.published_at ?? row.fetched_at ?? new Date(0).toISOString(),
    lastVerifiedAt: row.fetched_at ?? row.published_at ?? new Date(0).toISOString(),
    language: "it",
    geo: mapGeo(countryCode),
    topic: mapTopic(row.category, title, summary),
    originalUrl: row.primary_source_url,
    workflowState: mapWorkflowState(row.status),
    isDemo: false,
    category: mapCategory(row.category),
    country: COUNTRY_NAMES[countryCode] ?? countryCode,
  };
}
