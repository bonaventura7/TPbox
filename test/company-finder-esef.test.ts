import { describe, expect, it } from "vitest";

import {
  ESEF_BASE,
  extractHeadline,
  fetchEsefFinancials,
  parseFilingsPayload,
} from "../src/lib/company-finder/sources/bilanci/esef";

/**
 * Adapter ESEF (filings.xbrl.org): il contratto HTTP è stato verificato in
 * diretta il 2026-09-03. Questi test fissano il parser su payload realistici
 * senza toccare la rete (fetch iniettata).
 */

const LEI = "529900W3MOO00A18X956";

function filingsPayload(): unknown {
  return {
    data: [
      {
        attributes: {
          period_end: "2022-12-31",
          report_url: `/${LEI}/2022-12-31/ESEF/HU/0/x-hu/reports/r-hu.xhtml`,
          package_url: `/${LEI}/2022-12-31/ESEF/HU/0/x.zip`,
          json_url: `/${LEI}/2022-12-31/ESEF/HU/0/x.json`,
          country: "HU",
          processed: "2023-09-05 16:01:15",
        },
      },
      {
        // Stesso periodo, variante inglee processata dopo: deve sostituire
        // la prima SOLO se porta un json_url (lo porta) e processed >.
        attributes: {
          period_end: "2022-12-31",
          report_url: `/${LEI}/2022-12-31/ESEF/HU/1/x-en/reports/r-en.xhtml`,
          package_url: `/${LEI}/2022-12-31/ESEF/HU/1/x.zip`,
          json_url: `/${LEI}/2022-12-31/ESEF/HU/1/x.json`,
          country: "HU",
          processed: "2023-09-05 16:46:28",
        },
      },
      {
        attributes: {
          period_end: "2021-12-31",
          report_url: null,
          package_url: `/${LEI}/2021-12-31/ESEF/HU/0/x.zip`,
          json_url: null,
          country: "HU",
          processed: "2023-01-18 11:02:53",
        },
      },
    ],
  };
}

describe("parseFilingsPayload", () => {
  it("deduplica per periodo, preferisce json_url e il processed più recente", () => {
    const filings = parseFilingsPayload(filingsPayload());
    expect(filings).toHaveLength(2);
    expect(filings[0]!.periodEnd).toBe("2022-12-31");
    expect(filings[0]!.reportUrl).toBe(
      `${ESEF_BASE}/${LEI}/2022-12-31/ESEF/HU/1/x-en/reports/r-en.xhtml`,
    );
    expect(filings[1]!.periodEnd).toBe("2021-12-31");
    expect(filings[1]!.jsonUrl).toBeUndefined();
  });

  it("tollera payload vuoti o malformati", () => {
    expect(parseFilingsPayload(null)).toEqual([]);
    expect(parseFilingsPayload({ data: "no" })).toEqual([]);
    expect(parseFilingsPayload({ data: [{ attributes: {} }] })).toEqual([]);
  });
});

describe("extractHeadline", () => {
  it("estrae revenue e patrimonio consolidati ignorando i segmenti", () => {
    const doc = {
      facts: {
        f1: {
          value: 2202949000000,
          dimensions: {
            concept: "ifrs-full:Revenue",
            period: "2022-01-01T00:00:00/2022-12-31T24:00:00",
            unit: "iso4217:HUF",
            entity: `scheme:${LEI}`,
          },
        },
        // Segmento di business: dimensione esplicita NON standard → scartato.
        f2: {
          value: 111,
          dimensions: {
            concept: "ifrs-full:Revenue",
            period: "2022-01-01/2022-12-31",
            unit: "iso4217:HUF",
            "ifrs-full:ProductsAndServicesAxis": "ifrs-full:OtherSegment",
          },
        },
        f3: {
          value: 3284809000000,
          dimensions: {
            concept: "ifrs-full:Assets",
            period: "2022-12-31T24:00:00",
            unit: "iso4217:HUF",
          },
        },
        f4: {
          value: 324000000000,
          dimensions: {
            concept: "ifrs-full:Equity",
            period: "2022-12-31T24:00:00",
            unit: "iso4217:HUF",
          },
        },
      },
    };
    const h = extractHeadline(doc)!;
    expect(h.metrics.revenue).toBe(2202949000000);
    expect(h.metrics.totalAssets).toBe(3284809000000);
    expect(h.metrics.equity).toBe(324000000000);
    expect(h.currency).toBe("HUF");
  });

  it("restituisce undefined senza fatti utili", () => {
    expect(extractHeadline({})).toBeUndefined();
    expect(extractHeadline({ facts: {} })).toBeUndefined();
  });
});

function jsonResponse(body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("fetchEsefFinancials (fetch iniettata)", () => {
  const xbrl2022 = {
    facts: {
      a: {
        value: 2202949000000,
        dimensions: {
          concept: "ifrs-full:Revenue",
          period: "2022-01-01/2022-12-31",
          unit: "iso4217:HUF",
        },
      },
      b: {
        value: 324000000000,
        dimensions: {
          concept: "ifrs-full:Equity",
          period: "2022-12-31",
          unit: "iso4217:HUF",
        },
      },
    },
  };

  function stubFetch(overrides?: { jsonTooBig?: boolean }): typeof fetch {
    return (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${ESEF_BASE}/api/entities/${LEI}`) {
        return jsonResponse({ data: { attributes: { name: "OTP Bank Nyrt." } } });
      }
      if (url === `${ESEF_BASE}/api/entities/${LEI}/filings`) {
        return jsonResponse(filingsPayload());
      }
      if (url.includes(".json")) {
        if (overrides?.jsonTooBig) {
          return jsonResponse(xbrl2022, { "content-length": String(50 * 1024 * 1024) });
        }
        return jsonResponse(xbrl2022);
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
  }

  it("restituisce valori, documento proxato e denominazione ufficiale", async () => {
    const out = await fetchEsefFinancials(LEI, { fetchFn: stubFetch() });
    expect(out.ok).toBe(true);
    expect(out.entityName).toBe("OTP Bank Nyrt.");
    const data = out.data!;
    expect(data.available).toBe(true);
    expect(data.years.length).toBeGreaterThanOrEqual(1);
    expect(data.years[0]!.periodLabel).toBe("2022-12-31");
    expect(data.years[0]!.revenue).toBe(2202949000000);
    expect(data.years[0]!.currency).toBe("HUF");
    expect(data.documentUrl).toMatch(/^\/api\/company-finder\/document\?url=/);
    expect(decodeURIComponent(data.documentUrl!)).toContain(ESEF_BASE);
    expect(data.documentTitle).toContain("OTP Bank Nyrt.");
    expect(data.source).toMatch(/ESEF/);
  });

  it("JSON oltre il tetto: salta i valori ma consegna comunque il documento", async () => {
    const out = await fetchEsefFinancials(LEI, {
      fetchFn: stubFetch({ jsonTooBig: true }),
      maxJsonBytes: 20 * 1024 * 1024,
    });
    expect(out.ok).toBe(true);
    expect(out.data!.years).toHaveLength(0);
    expect(out.data!.documentUrl).toBeDefined();
    expect(out.data!.note).toMatch(/non sono stati estratti/);
  });

  it("LEI senza depositi: esito esplicito, non un fallimento di rete", async () => {
    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/filings")) return jsonResponse({ data: [] });
      return jsonResponse({});
    }) as typeof fetch;
    const out = await fetchEsefFinancials(LEI, { fetchFn });
    expect(out.ok).toBe(false);
    expect(out.skipped).toMatch(/nessun deposito ESEF/);
  });

  it("rifiuta un LEI malformato prima di chiamare la rete", async () => {
    let called = false;
    const fetchFn = (async () => {
      called = true;
      return jsonResponse({});
    }) as typeof fetch;
    const out = await fetchEsefFinancials("123", { fetchFn });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/LEI non valido/);
    expect(called).toBe(false);
  });

  it("errore di rete sui filings → esito fallito, mai dati inventati", async () => {
    const fetchFn = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/filings")) {
        return new Response("boom", { status: 503 });
      }
      return new Response("x", { status: 404 });
    }) as typeof fetch;
    const out = await fetchEsefFinancials(LEI, { fetchFn });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/503/);
    expect(out.data).toBeUndefined();
  });
});
