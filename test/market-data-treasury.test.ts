import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildDifferential } from "../src/lib/currency-benchmark/differential";
import { clearTreasuryMonths, fetchObservation } from "../src/lib/market-data/connectors.server";
import { handleMarketDataRequest } from "../src/lib/market-data/handler.server";
import { referenceRateId, type TenorId } from "../src/lib/market-data/registry";
import { isResolved, type MarketBundle } from "../src/lib/market-data/types";
import { SourceFormatError } from "../src/lib/market-data/csv";
import { metricById, RATE_METRICS, sourceUrlFor } from "../src/lib/market-data/registry";
import { SNAPSHOT_RATES } from "../src/lib/market-data/snapshots/2026-09-03";
import {
  parseTreasuryXml,
  previousMonthKey,
  treasuryFeedUrl,
  treasuryMonthKey,
} from "../src/lib/market-data/treasury";

/**
 * Il feed del Tesoro USA e' un documento Atom con gli elementi del dataset in un
 * namespace: i valori stanno in `<d:BC_5YEAR>`, una riga al giorno, tutte le
 * scadenze sulla stessa riga. La fixture riproduce quella struttura — prefissi,
 * attributi `m:type`, `NEW_DATE` con l'ora, `N/A` sulle scadenze non pubblicate —
 * e usa i valori reali della riga del 2026-09-01, gli stessi gia' congelati nello
 * snapshot per 2Y, 5Y e 10Y tramite FRED. Il parser e' stato provato anche su un
 * documento reale del feed (annata 2022), da cui questa fixture e' ricalcata.
 */
function feedXml(
  rows: readonly (readonly [string, Record<string, string>])[],
  prefix = "d",
): string {
  const body = rows
    .map(([date, fields]) => {
      const cells = Object.entries(fields)
        .map(
          ([name, value]) => `<${prefix}:${name} m:type="Edm.Double">${value}</${prefix}:${name}>`,
        )
        .join("");
      return [
        "<entry>",
        `<id>urn:uuid:${date}</id>`,
        "<updated>2026-09-04T02:01:00Z</updated>",
        `<title type="text">${date}</title>`,
        '<content type="application/xml">',
        `<${prefix}:DocumentElement>`,
        `<${prefix}:NEW_DATE m:type="Edm.DateTime">${date}T00:00:00</${prefix}:NEW_DATE>`,
        cells,
        `</${prefix}:DocumentElement>`,
        "</content>",
        "</entry>",
      ].join("");
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="utf-8" standalone="yes" ?>` +
    `<feed xml:base="https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml"` +
    ` xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices"` +
    ` xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata"` +
    ` xmlns="http://www.w3.org/2005/Atom">${body}</feed>`
  );
}

/** Riga reale del feed, 2026-09-01: 1M, 1,5M, 2M, 3M, 4M, 6M, 1Y, 2Y, 3Y, 5Y, 7Y, 10Y, 20Y, 30Y. */
const ROW_0901: Record<string, string> = {
  BC_1MONTH: "3.85",
  BC_6WEEK: "3.88",
  BC_2MONTH: "3.89",
  BC_3MONTH: "3.92",
  BC_4MONTH: "3.97",
  BC_6MONTH: "4.00",
  BC_1YEAR: "4.18",
  BC_2YEAR: "4.39",
  BC_3YEAR: "4.46",
  BC_5YEAR: "4.55",
  BC_7YEAR: "4.66",
  BC_10YEAR: "4.79",
  BC_20YEAR: "5.27",
  BC_30YEAR: "5.27",
};

const ROW_0902: Record<string, string> = { ...ROW_0901, BC_5YEAR: "4.54", BC_10YEAR: "4.78" };

/** Risposte per mese, con il conteggio delle chiamate per indirizzo. */
function stubFeed(months: Record<string, string>) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const month = new URL(url).searchParams.get("field_tdr_date_value_month");
    const body = month === null ? undefined : months[month];
    return new Response(body ?? "", { status: body === undefined ? 404 : 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

const OPTIONS = { timeoutMs: 8_000, signal: null, deadlineAt: Date.now() + 20_000 };

beforeEach(() => clearTreasuryMonths());
afterEach(() => {
  vi.unstubAllGlobals();
  clearTreasuryMonths();
});

describe("chiavi del feed del Tesoro", () => {
  it("ricava il mese dalla data e torna indietro sull'anno", () => {
    expect(treasuryMonthKey("2026-09-04")).toBe("202609");
    expect(treasuryMonthKey("2026-01-01")).toBe("202601");
    expect(previousMonthKey("202609")).toBe("202608");
    expect(previousMonthKey("202601")).toBe("202512");
  });

  it("costruisce l'indirizzo del mese richiesto", () => {
    expect(treasuryFeedUrl("202609")).toBe(
      "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml" +
        "?data=daily_treasury_yield_curve&field_tdr_date_value_month=202609",
    );
  });

  it("rifiuta una data o un mese illeggibili", () => {
    expect(() => treasuryMonthKey("ieri")).toThrow(SourceFormatError);
    expect(() => previousMonthKey("2026")).toThrow(SourceFormatError);
  });
});

describe("lettura del feed", () => {
  it("legge i campi con il prefisso di namespace e ignora quelli che non usa", () => {
    const parsed = parseTreasuryXml(feedXml([["2026-09-01", ROW_0901]]));
    expect(parsed["BC_5YEAR"]).toEqual([{ period: "2026-09-01", value: 4.55 }]);
    expect(parsed["BC_30YEARDISPLAY"]).toBeUndefined();
  });

  it("non confonde i campi di nome simile", () => {
    const parsed = parseTreasuryXml(feedXml([["2026-09-01", ROW_0901]]));
    expect(parsed["BC_1YEAR"]).toEqual([{ period: "2026-09-01", value: 4.18 }]);
    expect(parsed["BC_10YEAR"]).toEqual([{ period: "2026-09-01", value: 4.79 }]);
    expect(parsed["BC_3MONTH"]).toEqual([{ period: "2026-09-01", value: 3.92 }]);
  });

  it("ordina le osservazioni per giorno e salta i valori non pubblicati", () => {
    const parsed = parseTreasuryXml(
      feedXml([
        ["2026-09-01", ROW_0901],
        ["2026-09-02", { ...ROW_0902, BC_7YEAR: "N/A" }],
      ]),
    );
    expect(parsed["BC_5YEAR"]).toEqual([
      { period: "2026-09-01", value: 4.55 },
      { period: "2026-09-02", value: 4.54 },
    ]);
    expect(parsed["BC_7YEAR"]).toHaveLength(1);
  });

  it("accetta il documento anche senza prefisso di namespace", () => {
    const parsed = parseTreasuryXml(feedXml([["2026-09-01", ROW_0901]], "DocumentElement"));
    expect(parsed["BC_2YEAR"]?.[0]?.value).toBe(4.39);
  });

  it("si rompe in modo visibile se la struttura cambia", () => {
    expect(() => parseTreasuryXml("<feed></feed>")).toThrow(SourceFormatError);
    expect(() => parseTreasuryXml("<feed><entry><OTHER>1</OTHER></entry></feed>")).toThrow(
      SourceFormatError,
    );
  });
});

describe("risoluzione dal vivo della curva in dollari", () => {
  it("usa l'ultima osservazione non successiva alla data richiesta", async () => {
    stubFeed({
      "202609": feedXml([
        ["2026-09-01", ROW_0901],
        ["2026-09-02", ROW_0902],
      ]),
    });
    const metric = metricById("US_TREASURY_5Y");
    expect(metric).not.toBeNull();
    if (metric === null) return;
    const observation = await fetchObservation(metric, "2026-09-04", OPTIONS);
    expect(observation).toEqual({ period: "2026-09-02", value: 4.54 });
  });

  it("scarica il mese una sola volta per tutte le scadenze della curva", async () => {
    const { calls } = stubFeed({ "202609": feedXml([["2026-09-01", ROW_0901]]) });
    const curve = RATE_METRICS.filter((metric) => metric.source === "TREASURY");
    expect(curve).toHaveLength(8);
    const observations = await Promise.all(
      curve.map((metric) => fetchObservation(metric, "2026-09-03", OPTIONS)),
    );
    expect(observations.every((observation) => observation !== null)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("field_tdr_date_value_month=202609");
  });

  it("torna al mese precedente quando il mese richiesto non ha ancora dati", async () => {
    const { calls } = stubFeed({
      "202608": feedXml([["2026-08-31", { ...ROW_0901, BC_10YEAR: "4.70" }]]),
      "202609": feedXml([["2026-09-02", ROW_0902]]),
    });
    const metric = metricById("US_TREASURY_10Y");
    if (metric === null) throw new Error("metrica assente");
    const observation = await fetchObservation(metric, "2026-09-01", OPTIONS);
    expect(observation).toEqual({ period: "2026-08-31", value: 4.7 });
    expect(calls.map((url) => new URL(url).searchParams.get("field_tdr_date_value_month"))).toEqual(
      ["202609", "202608"],
    );
  });

  it("ripete la richiesta se la prima fallisce, senza servire l'errore a tutta la curva", async () => {
    const { calls } = stubFeed({});
    const metric = metricById("US_TREASURY_3M");
    if (metric === null) throw new Error("metrica assente");
    await expect(fetchObservation(metric, "2026-09-03", OPTIONS)).rejects.toThrow("HTTP 404");
    expect(calls.length).toBeGreaterThan(0);
    clearTreasuryMonths();
    stubFeed({ "202609": feedXml([["2026-09-01", ROW_0901]]) });
    await expect(fetchObservation(metric, "2026-09-03", OPTIONS)).resolves.toEqual({
      period: "2026-09-01",
      value: 3.92,
    });
  });

  it("dichiara indisponibile una scadenza che il feed non pubblica", async () => {
    // Se il campo sparisse dal feed la metrica resta senza osservazione: nessun
    // ripiego su un'altra scadenza e nessun valore stimato.
    stubFeed({
      "202609": feedXml([["2026-09-01", { BC_10YEAR: "4.79" }]]),
      "202608": feedXml([["2026-08-31", { BC_10YEAR: "4.7" }]]),
    });
    const metric = metricById("US_TREASURY_5Y");
    if (metric === null) throw new Error("metrica assente");
    expect(parseTreasuryXml(feedXml([["2026-09-01", { BC_10YEAR: "4.79" }]]))["BC_5YEAR"]).toBe(
      undefined,
    );
    await expect(fetchObservation(metric, "2026-09-03", OPTIONS)).resolves.toBeNull();
  });

  it("coincide con i valori congelati nello snapshot, che vengono dalla stessa curva", async () => {
    stubFeed({ "202609": feedXml([["2026-09-01", ROW_0901]]) });
    for (const id of ["US_TREASURY_2Y", "US_TREASURY_5Y", "US_TREASURY_10Y"] as const) {
      const metric = metricById(id);
      if (metric === null) throw new Error(`metrica assente: ${id}`);
      const observation = await fetchObservation(metric, "2026-09-03", OPTIONS);
      expect(observation?.value, id).toBe(SNAPSHOT_RATES[id]?.value);
    }
  });
});

describe("provenienza dichiarata", () => {
  it("dichiara fonte, campo e indirizzo del mese osservato", () => {
    const metric = metricById("US_TREASURY_7Y");
    expect(metric).not.toBeNull();
    if (metric === null) return;
    expect(metric.source).toBe("TREASURY");
    expect(metric.series).toBe("BC_7YEAR");
    expect(metric.verified).toBe(true);
    expect(sourceUrlFor(metric, "2026-08-31")).toContain("field_tdr_date_value_month=202608");
    expect(sourceUrlFor(metric, "2026-Q2")).toContain("field_tdr_date_value_month=");
  });

  it("non lascia scadenze della curva in dollari senza tasso di riferimento", () => {
    const curve = RATE_METRICS.filter((metric) => metric.id.startsWith("US_TREASURY_"));
    expect(curve.map((metric) => metric.series)).toEqual([
      "BC_3MONTH",
      "BC_6MONTH",
      "BC_1YEAR",
      "BC_2YEAR",
      "BC_3YEAR",
      "BC_5YEAR",
      "BC_7YEAR",
      "BC_10YEAR",
    ]);
    expect(curve.every((metric) => metric.verified)).toBe(true);
  });
});

describe("endpoint /api/market-data con la curva in dollari dal vivo", () => {
  /** CSV minimo nella forma della data API BCE: due colonne, una osservazione. */
  const ECB_CSV = "TIME_PERIOD,OBS_VALUE\n2026-09-03,3.05\n";

  /**
   * Il caso che ha portato alla migrazione: con FRED irraggiungibile il
   * differenziale si bloccava a 3M, 6M, 1Y, 3Y e 7Y. Qui la BCE risponde, FRED
   * no e il Tesoro risponde: la gamba in dollari deve arrivare dal vivo su tutte
   * e otto le scadenze con una sola chiamata al feed, e il differenziale deve
   * costruirsi su tutte le scadenze.
   */
  it("serve tutte le scadenze e sblocca il differenziale", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("home.treasury.gov")) {
        return new Response(feedXml([["2026-09-03", ROW_0901]]), { status: 200 });
      }
      if (url.includes("data-api.ecb.europa.eu")) {
        return new Response(ECB_CSV, { status: 200 });
      }
      return new Response("fonte non raggiungibile", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleMarketDataRequest(
      new Request("https://tpbox.test/api/market-data?date=2026-09-03&live=1"),
    );
    expect(response.status).toBe(200);
    const bundle = (await response.json()) as unknown as MarketBundle;

    const tenors: TenorId[] = ["3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y"];
    for (const tenor of tenors) {
      const metricId = referenceRateId("USD", tenor);
      const entry = metricId === null ? undefined : bundle.rates[metricId];
      expect(isResolved(entry), `USD ${tenor}`).toBe(true);
      if (isResolved(entry)) {
        expect(entry.cacheStatus, `USD ${tenor}`).toBe("LIVE");
        expect(entry.source, `USD ${tenor}`).toBe("TREASURY");
        expect(entry.asOf, `USD ${tenor}`).toBe("2026-09-03");
        expect(entry.sourceUrl, `USD ${tenor}`).toContain("field_tdr_date_value_month=202609");
      }
      const outcome = buildDifferential(bundle, "EUR", "USD", tenor);
      expect(outcome.ok, `differenziale EUR/USD ${tenor}`).toBe(true);
    }

    const treasury = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("home.treasury.gov"),
    );
    expect(treasury).toHaveLength(1);
    expect(String(treasury[0]?.[0])).toContain("field_tdr_date_value_month=202609");
  });
});
