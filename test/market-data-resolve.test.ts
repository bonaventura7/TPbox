import { describe, expect, it } from "vitest";

import { buildMarketBundle } from "../src/lib/market-data/resolve.server";
import { handleMarketDataRequest } from "../src/lib/market-data/handler.server";
import { ecbUrl, fredUrl } from "../src/lib/market-data/connectors.server";
import { metricById } from "../src/lib/market-data/registry";
import { isResolved } from "../src/lib/market-data/types";

/**
 * Tutti i test girano senza rete: `live: false` usa solo il dataset congelato.
 * Serve a fissare la regola piu' importante del risolutore, cioe' che un valore
 * congelato non viene mai usato per una data anteriore alla sua osservazione.
 */
const snapshotOnly = (date: string) => buildMarketBundle({ date, live: false, budgetMs: 0 });

describe("risoluzione dal dataset congelato", () => {
  it("serve i valori dello snapshot dichiarandoli tali", async () => {
    const bundle = await snapshotOnly("2026-09-03");
    const usd = bundle.fx["EUR/USD"];
    expect(isResolved(usd)).toBe(true);
    if (isResolved(usd)) {
      expect(usd.value).toBe(1.1615);
      expect(usd.asOf).toBe("2026-09-03");
      expect(usd.cacheStatus).toBe("CACHED");
      expect(usd.snapshotDate).toBe("2026-09-03");
      expect(usd.sourceUrl).toContain("data-api.ecb.europa.eu");
    }
    expect(bundle.mode).toBe("snapshot");
    expect(bundle.counts.live).toBe(0);
  });

  it("non usa un'osservazione successiva alla data richiesta", async () => {
    const bundle = await snapshotOnly("2026-01-15");
    const usd = bundle.fx["EUR/USD"];
    expect(usd?.status).toBe("UNAVAILABLE");
    if (usd?.status === "UNAVAILABLE") {
      expect(usd.reason).toContain("successiva alla data richiesta");
    }
  });

  it("marca come da verificare un valore congelato troppo distante", async () => {
    const bundle = await snapshotOnly("2027-06-01");
    const usd = bundle.fx["EUR/USD"];
    expect(isResolved(usd) && usd.cacheStatus).toBe("CACHED_STALE");
    expect(bundle.warnings.join(" ")).toContain("da verificare");
  });

  it("misura l'obsolescenza sulla frequenza della serie, non su un numero fisso di giorni", async () => {
    // Al 20 ottobre un cambio giornaliero del 3 settembre e' vecchio; la media
    // del secondo trimestre, che copre tre mesi, no.
    const bundle = await snapshotOnly("2026-10-20");
    const daily = bundle.fx["EUR/USD"];
    const quarterly = bundle.rates["EURIBOR_1Y_Q"];
    expect(isResolved(daily) && daily.cacheStatus).toBe("CACHED_STALE");
    expect(isResolved(quarterly) && quarterly.cacheStatus).toBe("CACHED");
  });

  it("dichiara mancanti le serie che il dataset non contiene", async () => {
    const bundle = await snapshotOnly("2026-09-03");
    const govt = bundle.rates["EA_GOVT_5Y"];
    expect(govt?.status).toBe("UNAVAILABLE");
    if (govt?.status === "UNAVAILABLE") {
      expect(govt.reason).toContain("dataset congelato");
    }
    expect(bundle.counts.unavailable).toBeGreaterThan(0);
  });

  it("usa la media mensile solo quando il mese e' chiuso", async () => {
    const closed = await snapshotOnly("2026-09-03");
    const euribor = closed.rates["EURIBOR_6M_M"];
    expect(isResolved(euribor) && euribor.asOf).toBe("2026-08");

    const beforeClose = await snapshotOnly("2026-08-10");
    expect(beforeClose.rates["EURIBOR_6M_M"]?.status).toBe("UNAVAILABLE");
  });

  it("serve il country risk dell'aggiornamento di gennaio", async () => {
    const bundle = await snapshotOnly("2026-09-03");
    expect(bundle.country.status).toBe("OK");
    if (bundle.country.status === "OK") {
      expect(bundle.country.data.ratingMoodys).toBe("Baa2");
      expect(bundle.country.asOf).toBe("2026-01-01");
      expect(bundle.country.cacheStatus).toBe("CACHED");
    }

    const older = await snapshotOnly("2025-06-01");
    expect(older.country.status).toBe("UNAVAILABLE");
  });

  it("conta le voci e ne dichiara la provenienza", async () => {
    const bundle = await snapshotOnly("2026-09-03");
    expect(bundle.counts.fxTotal).toBe(12);
    expect(bundle.counts.fxOk).toBe(12);
    expect(bundle.counts.ratesTotal).toBeGreaterThan(16);
    expect(bundle.dataset.snapshotDate).toBe("2026-09-03");
  });
});

describe("indirizzi delle fonti", () => {
  it("restringe la finestra richiesta alla BCE", () => {
    const metric = metricById("EURIBOR_6M_M");
    expect(metric).not.toBeNull();
    if (metric === null) return;
    const url = ecbUrl(metric, "2026-09-03");
    expect(url).toContain("/FM/M.U2.EUR.RT.MM.EURIBOR6MD_.HSTA");
    expect(url).toContain("format=csvdata");
    expect(url).toContain("startPeriod=2025-07");
  });

  it("restringe la finestra richiesta a FRED", () => {
    const metric = metricById("US_TREASURY_10Y");
    expect(metric).not.toBeNull();
    if (metric === null) return;
    const url = fredUrl(metric, "2026-09-03");
    expect(url).toContain("id=DGS10");
    expect(url).toContain("cosd=2025-07");
  });
});

describe("endpoint /api/market-data", () => {
  const call = (query: string) =>
    handleMarketDataRequest(new Request(`https://tpbox.test/api/market-data${query}`));

  it("rifiuta una data non valida", async () => {
    const response = await call("?date=ieri&live=0");
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("YYYY-MM-DD");
  });

  it("rifiuta una data anteriore all'euro", async () => {
    const response = await call("?date=1990-01-01&live=0");
    expect(response.status).toBe(400);
  });

  it("risponde con i dati e le intestazioni di cache", async () => {
    const response = await call("?date=2026-09-03&live=0");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage");
    const body = (await response.json()) as { dataset: { snapshotDate: string }; mode: string };
    expect(body.mode).toBe("snapshot");
    expect(body.dataset.snapshotDate).toBe("2026-09-03");
  });
});
