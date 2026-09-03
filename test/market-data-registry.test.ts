import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  ALL_METRICS,
  FX_CURRENCIES,
  FX_METRICS,
  RATE_METRICS,
  REFERENCE_RATES,
  metricById,
  referenceRateId,
  sourceUrlFor,
  TENORS,
  type TenorId,
} from "../src/lib/market-data/registry";
import { canonicalSnapshot, DATASET } from "../src/lib/market-data/snapshots/manifest";
import { SNAPSHOT_FX, SNAPSHOT_RATES } from "../src/lib/market-data/snapshots/2026-09-03";
import { resolveFxPair } from "../src/lib/market-data/fx";
import type { MarketEntry } from "../src/lib/market-data/types";

/** Hash della forma canonica del dataset congelato: cambia solo se cambiano i valori. */
const SNAPSHOT_FINGERPRINT = "6d574f4d8d620c70f70e0ca197a30e5b42fc6fbb2e37f589307e6cffd7d24368";

describe("registry delle metriche", () => {
  it("non ha identificativi duplicati", () => {
    const ids = ALL_METRICS.map((metric) => metric.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("costruisce un url di fonte per ogni metrica", () => {
    for (const metric of ALL_METRICS) {
      const url = sourceUrlFor(metric);
      expect(url.startsWith("https://"), metric.id).toBe(true);
      if (metric.source === "ECB") expect(url).toContain(`/${metric.flow}/${metric.series}`);
      if (metric.source === "FRED") expect(url).toContain(metric.series);
    }
  });

  it("dichiara le valute dei cambi coerentemente con le serie", () => {
    expect(FX_CURRENCIES).toContain("EUR");
    for (const metric of FX_METRICS) {
      const currency = metric.pair.split("/")[1];
      expect(FX_CURRENCIES, metric.pair).toContain(currency);
      expect(metric.series).toBe(`D.${currency}.EUR.SP00.A`);
    }
  });

  it("mappa i tassi di riferimento solo su metriche esistenti", () => {
    for (const [currency, tenors] of Object.entries(REFERENCE_RATES)) {
      for (const [tenor, metricId] of Object.entries(tenors)) {
        const metric = metricById(metricId);
        expect(metric, `${currency} ${tenor} -> ${metricId}`).not.toBeNull();
        expect(metric?.kind).toBe("rate");
      }
    }
  });

  it("usa solo tenor previsti dall'elenco", () => {
    const known = new Set(TENORS.map((tenor) => tenor.id));
    for (const tenors of Object.values(REFERENCE_RATES)) {
      for (const tenor of Object.keys(tenors)) {
        expect(known.has(tenor as TenorId), tenor).toBe(true);
      }
    }
  });

  it("copre le stesse scadenze su euro e dollaro, perche' il differenziale vuole gambe omogenee", () => {
    const eur = Object.keys(REFERENCE_RATES["EUR"] ?? {}).sort();
    const usd = Object.keys(REFERENCE_RATES["USD"] ?? {}).sort();
    expect(eur).toEqual(usd);
    expect(eur.length).toBeGreaterThan(0);
  });

  it("non promette un tasso di riferimento dove non c'e'", () => {
    expect(referenceRateId("GBP", "5Y")).toBeNull();
    expect(referenceRateId("EUR", "9Y")).toBeNull();
    expect(referenceRateId("EUR", "5Y")).toBe("EA_GOVT_5Y");
  });
});

describe("dataset congelato", () => {
  it("contiene solo serie presenti nel registry", () => {
    for (const pair of Object.keys(SNAPSHOT_FX)) {
      expect(
        FX_METRICS.some((metric) => metric.pair === pair),
        pair,
      ).toBe(true);
    }
    for (const id of Object.keys(SNAPSHOT_RATES)) {
      expect(metricById(id), id).not.toBeNull();
    }
  });

  it("ha valori positivi e date leggibili", () => {
    for (const [key, point] of Object.entries({ ...SNAPSHOT_FX, ...SNAPSHOT_RATES })) {
      expect(Number.isFinite(point.value), key).toBe(true);
      expect(point.asOf, key).toMatch(/^\d{4}(-\d{2}(-\d{2})?|-Q[1-4])$/);
    }
  });

  it("dichiara la provenienza dello snapshot di origine", () => {
    expect(DATASET.snapshotDate).toBe("2026-09-03");
    expect(DATASET.originHash).toHaveLength(64);
    expect(DATASET.version).toContain("2026-09-03");
  });

  it("non cambia valori senza che il dataset venga riversionato", () => {
    const fingerprint = createHash("sha256").update(canonicalSnapshot(), "utf8").digest("hex");
    expect(fingerprint).toBe(SNAPSHOT_FINGERPRINT);
  });
});

function ok(pair: string, value: number, asOf: string): MarketEntry {
  return {
    status: "OK",
    metricId: `FX_${pair.replace("/", "_")}`,
    label: `${pair} spot`,
    requestedDate: "2026-09-03",
    unit: "per EUR",
    source: "ECB",
    series: `D.${pair.split("/")[1]}.EUR.SP00.A`,
    sourceUrl: "https://data-api.ecb.europa.eu/service/data/EXR/x",
    retrievedAt: "2026-09-03T00:00:00Z",
    value,
    asOf,
    cacheStatus: "LIVE",
    snapshotDate: null,
  };
}

describe("cambi e cross rate", () => {
  const fx: Record<string, MarketEntry> = {
    "EUR/USD": ok("EUR/USD", 1.1615, "2026-09-03"),
    "EUR/GBP": ok("EUR/GBP", 0.86055, "2026-09-03"),
    "EUR/CHF": ok("EUR/CHF", 0.939, "2026-09-02"),
  };

  it("restituisce l'unita' per la stessa valuta", () => {
    const quote = resolveFxPair(fx, "EUR", "EUR");
    expect(quote.status).toBe("OK");
    if (quote.status === "OK") {
      expect(quote.value).toBe(1);
      expect(quote.method).toBe("IDENTITY");
    }
  });

  it("usa la serie diretta per EUR/x", () => {
    const quote = resolveFxPair(fx, "EUR", "GBP");
    expect(quote.status === "OK" && quote.method).toBe("DIRECT");
    expect(quote.status === "OK" && quote.value).toBe(0.86055);
  });

  it("usa il reciproco per x/EUR", () => {
    const quote = resolveFxPair(fx, "USD", "EUR");
    expect(quote.status === "OK" && quote.method).toBe("INVERSE");
    if (quote.status === "OK") expect(quote.value).toBeCloseTo(1 / 1.1615, 12);
  });

  it("calcola il cross fra due valute terze dalle due gambe in euro", () => {
    const quote = resolveFxPair(fx, "USD", "GBP");
    expect(quote.status === "OK" && quote.method).toBe("CROSS");
    if (quote.status === "OK") {
      expect(quote.value).toBeCloseTo(0.86055 / 1.1615, 12);
      expect(quote.legs).toHaveLength(2);
      expect(quote.asOfMismatch).toBe(false);
    }
  });

  it("segnala quando le due gambe hanno date diverse", () => {
    const quote = resolveFxPair(fx, "CHF", "GBP");
    expect(quote.status === "OK" && quote.asOfMismatch).toBe(true);
  });

  it("dice perche' una coppia non e' disponibile invece di stimarla", () => {
    const quote = resolveFxPair(fx, "EUR", "TRY");
    expect(quote.status).toBe("UNAVAILABLE");
    if (quote.status === "UNAVAILABLE") expect(quote.reason).toContain("EUR/TRY");
  });
});
