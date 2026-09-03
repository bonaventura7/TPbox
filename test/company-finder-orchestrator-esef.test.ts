import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runSearch } from "../src/lib/company-finder/orchestrator";
import { ESEF_BASE, ESEF_ISOS } from "../src/lib/company-finder/sources/bilanci/esef";
import { ALL_COUNTRIES } from "../src/lib/company-finder/countries";

/**
 * Integrazione orchestratore ↔ ESEF senza rete: fetch globale stubbata con
 * payload realistici (GLEIF, e-Beszámoló con ALTCHA, filings.xbrl.org).
 * Dimostra le due cose che contano per HU:
 *   1. società QUOTATA  → valori + documento ESEF, anche se il registro
 *      nazionale dichiara CAPTCHA_REQUIRED;
 *   2. società NON QUOTATA → nessun dato inventato: restrizione dichiarata
 *      e pagina ufficiale in modalità "external" con istruzioni.
 */

const LEI = "529900W3MOO00A18X956";

const ALTCHA_PAGE = `<!DOCTYPE html><html><body>
<form action="/Search/Results" enctype="multipart/form-data" method="post">
<altcha-widget challengeurl="/altcha/challenge"></altcha-widget>
</form></body></html>`;

const XBRL = {
  facts: {
    a: {
      value: 2202949000000,
      dimensions: {
        concept: "ifrs-full:Revenue",
        period: "2024-01-01/2024-12-31",
        unit: "iso4217:HUF",
      },
    },
    b: {
      value: 324000000000,
      dimensions: {
        concept: "ifrs-full:Equity",
        period: "2024-12-31",
        unit: "iso4217:HUF",
      },
    },
  },
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function html(body: string): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/html" } });
}

function makeFetch(gleifMatches: unknown[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://api.gleif.org/")) {
      return json({ data: gleifMatches });
    }
    if (url.startsWith("https://e-beszamolo.im.gov.hu/")) {
      return html(ALTCHA_PAGE);
    }
    if (url === `${ESEF_BASE}/api/entities/${LEI}`) {
      return json({ data: { attributes: { name: "OTP Bank Nyrt." } } });
    }
    if (url === `${ESEF_BASE}/api/entities/${LEI}/filings`) {
      return json({
        data: [
          {
            attributes: {
              period_end: "2024-12-31",
              report_url: `/${LEI}/2024-12-31/ESEF/HU/0/r/reports/r.xhtml`,
              json_url: `/${LEI}/2024-12-31/ESEF/HU/0/r.json`,
              country: "HU",
              processed: "2025-04-01 10:00:00",
            },
          },
        ],
      });
    }
    if (url.endsWith(`${LEI}/2024-12-31/ESEF/HU/0/r.json`)) {
      return json(XBRL);
    }
    return new Response("not stubbed", { status: 404 });
  }) as typeof fetch;
}

const OTP_GLEIF = [
  {
    attributes: {
      lei: LEI,
      entity: {
        legalName: { name: "OTP Bank Nyrt." },
        legalAddress: { country: "HU", city: "Budapest" },
        registeredAs: "01-10-041585",
        status: "ACTIVE",
      },
    },
  },
];

beforeEach(() => {
  vi.useRealTimers();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wiring orchestratore ↔ ESEF", () => {
  it("HU quotata: ESEF consegna valori e documento, HU dichiara la restrizione", async () => {
    vi.stubGlobal("fetch", makeFetch(OTP_GLEIF));
    const r = await runSearch({ query: "OTP Bank Nyrt", vat: "", country: "HU" });

    expect(r.found).toBe(true);
    expect(r.company?.name).toBe("OTP Bank Nyrt.");

    const esef = r.sources.find((s) => s.id === "esef");
    expect(esef?.state).toBe("ok");
    const hu = r.sources.find((s) => s.id === "fin-ebeszamolo");
    expect(hu?.state).toBe("skipped");
    expect(hu?.detail).toMatch(/anti-bot/);

    expect(r.financials?.years.length).toBeGreaterThanOrEqual(1);
    expect(r.financials?.years[0]?.revenue).toBe(2202949000000);
    expect(r.financials?.years[0]?.currency).toBe("HUF");
    expect(r.financials?.source).toMatch(/ESEF/);
    expect(r.financials?.documentUrl).toMatch(/^\/api\/company-finder\/document\?url=/);
    // Documento presente: la card del portale non serve, viene soppressa.
    expect(r.officialPage).toBeUndefined();
  });

  it("HU non quotata: nessun dato inventato; restrizione dichiarata + percorso umano", async () => {
    vi.stubGlobal("fetch", makeFetch([]));
    const r = await runSearch({ query: "Kis Kft Adótanácsadó", vat: "", country: "HU" });

    expect(r.found).toBe(true);
    const esef = r.sources.find((s) => s.id === "esef");
    expect(esef?.state).toBe("skipped");
    expect(esef?.detail).toMatch(/nessun LEI/);

    expect(r.financials?.years).toHaveLength(0);
    expect(r.financials?.availability).toBe("REGISTRY_ONLY");
    expect(r.financials?.restriction).toBe("CAPTCHA_REQUIRED");

    expect(r.officialPage?.mode).toBe("external");
    expect(r.officialPage?.url).toContain("e-beszamolo.im.gov.hu/oldal/beszamolo_kereses");
    expect((r.officialPage?.instructions ?? []).length).toBeGreaterThan(2);
    expect(r.officialPage?.note).toMatch(/beszamolo_allomany_ertekesitese/);
  });

  it("il perimetro ESEF copre HU e IT, esclude UK e resta nel catalogo", () => {
    expect(ESEF_ISOS.has("HU")).toBe(true);
    expect(ESEF_ISOS.has("IT")).toBe(true);
    expect(ESEF_ISOS.has("UK")).toBe(false);
    const catalog = new Set(ALL_COUNTRIES.map((c) => c.iso));
    for (const iso of ESEF_ISOS) {
      expect(catalog.has(iso), `${iso} ESEF ma non in catalogo`).toBe(true);
    }
  });
});
