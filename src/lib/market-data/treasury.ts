import type { Observation } from "./as-of";

const TREASURY_XML_BASE =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml";

const TENOR_FIELDS = [
  "BC_3MONTH",
  "BC_6MONTH",
  "BC_1YEAR",
  "BC_2YEAR",
  "BC_3YEAR",
  "BC_5YEAR",
  "BC_7YEAR",
  "BC_10YEAR",
] as const;

export type TreasurySeries = (typeof TENOR_FIELDS)[number];

function xmlTag(properties: string, name: string): string | null {
  const match = new RegExp(`<[^>]*:${name}[^>]*>([^<]*)</[^>]*:${name}>`).exec(properties);
  return match?.[1]?.trim() || null;
}

/** Parses the official Treasury OData XML feed into dated tenor observations. */
export function parseTreasuryXml(xml: string): Observation[] & { readonly length: number } {
  const observations: Observation[] = [];
  const propertiesBlocks = xml.match(/<[^>]*:?properties\b[^>]*>[\s\S]*?<\/[^>]*:?properties>/gi) ?? [];

  for (const properties of propertiesBlocks) {
    const rawDate = xmlTag(properties, "NEW_DATE");
    if (!rawDate) continue;
    const date = rawDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    for (const series of TENOR_FIELDS) {
      const rawValue = xmlTag(properties, series);
      if (!rawValue || /^N\/A$/i.test(rawValue)) continue;
      const value = Number(rawValue.replace(/,/g, ""));
      if (Number.isFinite(value)) observations.push({ period: date, value });
    }
  }

  // The Observation contract carries the period/value pair only; the parser's
  // public helper is intentionally one-series-at-a-time via the companion filter.
  return observations;
}

export function treasurySeriesObservations(xml: string, series: TreasurySeries): Observation[] {
  const observations: Observation[] = [];
  const propertiesBlocks = xml.match(/<[^>]*:?properties\b[^>]*>[\s\S]*?<\/[^>]*:?properties>/gi) ?? [];
  for (const properties of propertiesBlocks) {
    const rawDate = xmlTag(properties, "NEW_DATE");
    const rawValue = xmlTag(properties, series);
    if (!rawDate || !rawValue || /^N\/A$/i.test(rawValue)) continue;
    const date = rawDate.slice(0, 10);
    const value = Number(rawValue.replace(/,/g, ""));
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value)) {
      observations.push({ period: date, value });
    }
  }
  return observations;
}

export function treasuryUrl(date: string): string {
  const month = date.slice(0, 7).replace("-", "");
  const query = new URLSearchParams({
    data: "daily_treasury_yield_curve",
    field_tdr_date_value_month: month,
  });
  return `${TREASURY_XML_BASE}?${query.toString()}`;
}

export const TREASURY_SOURCE_URL = TREASURY_XML_BASE;
