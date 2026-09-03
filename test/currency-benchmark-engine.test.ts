import { describe, expect, it } from "vitest";

import {
  convert,
  ENGINE_VERSION,
  percentile,
  rangeStats,
  toCsv,
  toPercent,
} from "../src/lib/currency-benchmark/engine";
import { parseDecimal, parsePastedRows } from "../src/lib/currency-benchmark/parse";
import { buildDifferential } from "../src/lib/currency-benchmark/differential";
import type {
  ConversionSettings,
  Differential,
  Observation,
  RateLeg,
} from "../src/lib/currency-benchmark/types";
import type { MarketBundle, MarketEntry } from "../src/lib/market-data/types";

function leg(currency: string, value: number, asOf: string): RateLeg {
  return {
    currency,
    metricId: `${currency}_REF`,
    label: `Riferimento ${currency}`,
    value,
    asOf,
    source: "ECB",
    series: "X",
    sourceUrl: "https://example.invalid",
    cacheStatus: "LIVE",
    verified: true,
  };
}

function differential(sourceRate: number, targetRate: number, mismatch = false): Differential {
  return {
    sourceLeg: leg("EUR", sourceRate, "2026-09-01"),
    targetLeg: leg("USD", targetRate, mismatch ? "2026-08" : "2026-09-01"),
    deltaBp: Number(((targetRate - sourceRate) * 100).toFixed(6)),
    asOfMismatch: mismatch,
  };
}

function settings(patch: Partial<ConversionSettings> = {}): ConversionSettings {
  return {
    sourceCurrency: "EUR",
    targetCurrency: "USD",
    tenor: "5Y",
    metricUnit: "percent",
    metricType: "yield",
    method: "RATE_DIFFERENTIAL",
    manualBasisBp: null,
    differential: differential(2.5, 4.55),
    differentialBlockedReason: null,
    ...patch,
  };
}

function observation(value: number | null, raw = String(value)): Observation {
  return { id: "IQT1", raw, value };
}

describe("lettura dei numeri incollati", () => {
  it("legge la virgola decimale italiana e il punto decimale", () => {
    expect(parseDecimal("7,878")).toEqual({ ok: true, value: 7.878 });
    expect(parseDecimal("7.878")).toEqual({ ok: true, value: 7.878 });
    expect(parseDecimal("-0,25")).toEqual({ ok: true, value: -0.25 });
    expect(parseDecimal("7,878%")).toEqual({ ok: true, value: 7.878 });
  });

  it("risolve i separatori delle migliaia in entrambe le convenzioni", () => {
    expect(parseDecimal("1.234,56")).toEqual({ ok: true, value: 1234.56 });
    expect(parseDecimal("1,234.56")).toEqual({ ok: true, value: 1234.56 });
  });

  it("rifiuta i casi ambigui invece di scegliere", () => {
    expect(parseDecimal("1,2,3").ok).toBe(false);
    expect(parseDecimal("1.2.3").ok).toBe(false);
    expect(parseDecimal("")).toEqual({ ok: false, reason: "vuoto" });
    expect(parseDecimal("n.d.").ok).toBe(false);
  });

  it("importa una o due colonne e riporta gli scarti", () => {
    const result = parsePastedRows("IQT245862223\t7,878\nIQT263552785\t7,697\ntesto libero", 0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ id: "IQT245862223", raw: "7,878", value: 7.878 });
    expect(result.skipped).toHaveLength(1);
  });

  it("genera l'identificativo quando c'e' solo la metrica", () => {
    const result = parsePastedRows("7,878\n7,697", 3);
    expect(result.rows.map((row) => row.id)).toEqual(["RIGA-0004", "RIGA-0005"]);
  });
});

describe("conversione della singola osservazione", () => {
  it("non tocca il valore quando le valute coincidono", () => {
    const result = convert(observation(7.878), settings({ targetCurrency: "EUR" }));
    expect(result.status).toBe("VALID");
    expect(result.method).toBe("IDENTITY");
    expect(result.targetPercent).toBe(7.878);
    expect(result.deltaBp).toBe(0);
  });

  it("applica il differenziale dei tassi di riferimento", () => {
    const result = convert(observation(7.878), settings());
    expect(result.status).toBe("VALID");
    expect(result.method).toBe("RATE_DIFFERENTIAL");
    expect(result.deltaBp).toBeCloseTo(205, 6);
    expect(result.targetPercent).toBeCloseTo(9.928, 9);
    expect(result.basis).toContain("Riferimento USD");
  });

  it("converte anche i valori inseriti in basis point", () => {
    const result = convert(observation(787.8), settings({ metricUnit: "bps" }));
    expect(result.sourcePercent).toBeCloseTo(7.878, 9);
    expect(result.targetBp).toBeCloseTo(992.8, 6);
  });

  it("applica l'aggiustamento manuale con il segno dichiarato", () => {
    const result = convert(
      observation(5),
      settings({ method: "MANUAL_ADJUSTMENT", manualBasisBp: -35, differential: null }),
    );
    expect(result.targetPercent).toBeCloseTo(4.65, 9);
    expect(result.deltaBp).toBe(-35);
    expect(result.basis).toContain("analista");
  });

  it("blocca il differenziale su uno spread creditizio, dove lo conterebbe due volte", () => {
    const result = convert(observation(2.5), settings({ metricType: "credit_spread" }));
    expect(result.status).toBe("BLOCKED");
    expect(result.warning).toContain("tasso base");
    expect(result.targetPercent).toBeNull();
  });

  it("blocca il cross-currency basis e la metrica generica", () => {
    expect(convert(observation(1), settings({ metricType: "xccy_basis" })).status).toBe("BLOCKED");
    expect(convert(observation(1), settings({ metricType: "other" })).status).toBe("BLOCKED");
  });

  it("consente l'aggiustamento manuale anche dove il differenziale e' bloccato", () => {
    const result = convert(
      observation(2.5),
      settings({
        metricType: "credit_spread",
        method: "MANUAL_ADJUSTMENT",
        manualBasisBp: 12,
        differential: null,
      }),
    );
    expect(result.status).toBe("VALID");
  });

  it("riporta il motivo quando il differenziale non c'e'", () => {
    const result = convert(
      observation(2.5),
      settings({ differential: null, differentialBlockedReason: "serie mancante per GBP a 5Y" }),
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.warning).toBe("serie mancante per GBP a 5Y");
  });

  it("avvisa quando le due gambe hanno date diverse", () => {
    const result = convert(
      observation(5),
      settings({ differential: differential(2.5, 4.55, true) }),
    );
    expect(result.status).toBe("VALID");
    expect(result.warning).toContain("date diverse");
  });

  it("segnala un valore non leggibile come errore, non come zero", () => {
    const result = convert(observation(null, "n.d."), settings());
    expect(result.status).toBe("ERROR");
    expect(result.targetPercent).toBeNull();
  });

  it("converte le unita' in modo simmetrico", () => {
    expect(toPercent(250, "bps")).toBe(2.5);
    expect(toPercent(2.5, "percent")).toBe(2.5);
  });
});

describe("percentili e range", () => {
  it("interpola linearmente, la convenzione dei benchmark", () => {
    expect(percentile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 12);
    expect(percentile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 12);
    expect(percentile([1, 2, 3, 4], 0.75)).toBeCloseTo(3.25, 12);
    expect(percentile([7.697, 7.878, 8.015], 0.5)).toBeCloseTo(7.878, 12);
  });

  it("non inventa un range su una popolazione vuota", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(rangeStats([])).toBeNull();
  });

  it("ordina la popolazione prima di calcolare", () => {
    const stats = rangeStats([8.015, 7.697, 7.878]);
    expect(stats?.min).toBeCloseTo(7.697, 12);
    expect(stats?.max).toBeCloseTo(8.015, 12);
    expect(stats?.count).toBe(3);
  });
});

describe("esportazione", () => {
  it("produce righe con lo stesso numero di celle dell'intestazione", () => {
    const rows = [observation(7.878), observation(7.697)].map((obs) => ({
      observation: obs,
      result: convert(obs, settings()),
    }));
    const csv = toCsv(rows, {
      settings: settings(),
      datasetVersion: "tp-market-data-2026-09-03.v1",
      requestedDate: "2026-09-03",
      generatedAt: "2026-09-03T12:00:00Z",
    });
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    const header = lines[0]?.split(";") ?? [];
    for (const line of lines.slice(1)) {
      expect(line.split(";")).toHaveLength(header.length);
    }
    expect(csv).toContain(ENGINE_VERSION);
    expect(csv).toContain("tp-market-data-2026-09-03.v1");
  });
});

function rateEntry(metricId: string, value: number, asOf: string): MarketEntry {
  return {
    status: "OK",
    metricId,
    label: metricId,
    requestedDate: "2026-09-03",
    unit: "percent",
    source: "ECB",
    series: "X",
    sourceUrl: "https://example.invalid",
    retrievedAt: "2026-09-03T00:00:00Z",
    value,
    asOf,
    cacheStatus: "LIVE",
    snapshotDate: null,
  };
}

function bundle(rates: Record<string, MarketEntry>): MarketBundle {
  return {
    requestedDate: "2026-09-03",
    generatedAt: "2026-09-03T00:00:00Z",
    mode: "live",
    dataset: {
      version: "test",
      snapshotDate: "2026-09-03",
      builtAt: "2026-09-03T00:00:00Z",
      originHash: "0".repeat(64),
    },
    fx: {},
    rates,
    country: {
      status: "UNAVAILABLE",
      metricId: "DAMODARAN_IT",
      label: "country",
      requestedDate: "2026-09-03",
      unit: "frazioni",
      source: "DAMODARAN",
      series: "ctryprem.xlsx",
      sourceUrl: "https://example.invalid",
      retrievedAt: "2026-09-03T00:00:00Z",
      reason: "non serve al test",
    },
    counts: {
      fxTotal: 0,
      fxOk: 0,
      ratesTotal: Object.keys(rates).length,
      ratesOk: Object.keys(rates).length,
      live: Object.keys(rates).length,
      cached: 0,
      unavailable: 0,
    },
    warnings: [],
  };
}

describe("costruzione del differenziale dai dati di mercato", () => {
  it("prende le due gambe alla stessa scadenza", () => {
    const outcome = buildDifferential(
      bundle({
        EA_GOVT_5Y: rateEntry("EA_GOVT_5Y", 2.61, "2026-09-02"),
        US_TREASURY_5Y: rateEntry("US_TREASURY_5Y", 4.55, "2026-09-01"),
      }),
      "EUR",
      "USD",
      "5Y",
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.differential.deltaBp).toBeCloseTo(194, 6);
      expect(outcome.differential.asOfMismatch).toBe(true);
      expect(outcome.differential.sourceLeg.currency).toBe("EUR");
    }
  });

  it("si blocca dichiarando la valuta senza copertura", () => {
    const outcome = buildDifferential(bundle({}), "EUR", "CHF", "5Y");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("CHF");
  });

  it("si blocca riportando il motivo della fonte quando la serie non e' risolta", () => {
    const outcome = buildDifferential(
      bundle({
        EA_GOVT_5Y: rateEntry("EA_GOVT_5Y", 2.61, "2026-09-02"),
        US_TREASURY_5Y: {
          status: "UNAVAILABLE",
          metricId: "US_TREASURY_5Y",
          label: "Treasury USA 5 anni",
          requestedDate: "2026-09-03",
          unit: "percent",
          source: "FRED",
          series: "DGS5",
          sourceUrl: "https://example.invalid",
          retrievedAt: "2026-09-03T00:00:00Z",
          reason: "HTTP 503",
        },
      }),
      "EUR",
      "USD",
      "5Y",
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("HTTP 503");
  });
});
