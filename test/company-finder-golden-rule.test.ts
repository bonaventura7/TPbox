import { afterEach, describe, expect, it, vi } from "vitest";

import type { SearchResponse } from "../src/lib/company-finder/types";
import { getCountry } from "../src/lib/company-finder/countries";

afterEach(() => vi.unstubAllGlobals());

/**
 * `prioritizeBalanceDocumentForTest` chiama `resolveGreekBalance`, che esegue
 * un fetch di rete verso publicity.businessportal.gr quando il paese è GR e
 * non c'è già un `documentUrl`. In produzione quella pagina è una SPA
 * Angular: il contenuto HTML servito lato server non contiene mai il link
 * `filings.businessportal...ixbrlview.html` (è renderizzato lato client),
 * quindi il regex server-side non lo trova mai e la risoluzione fallisce
 * sempre. Questo stub riproduce esattamente quell'esito — nessun link nel
 * markup — così il test resta deterministico e non tocca la rete.
 */
function stubGreekPortalWithoutFilingLink(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        '<html><body><app-root></app-root><script src="main.js"></script></body></html>',
    })) as unknown as typeof fetch,
  );
}

/** Host dei registri: non devono comparire in nessun campo della risposta. */
const REGISTRY_HOSTS = [
  "registeruz.sk",
  "ekrs.ms.gov.pl",
  "publicity.businessportal.gr",
  "consult.cbso.nbb.be",
  "ws.cbso.nbb.be",
];

/** La regola d'oro: nessun officialPage, nessun host di registro nella risposta. */
export function expectGoldenRule(response: SearchResponse): void {
  expect(response.officialPage).toBeUndefined();
  const serialized = JSON.stringify(response);
  for (const host of REGISTRY_HOSTS) {
    expect(serialized).not.toContain(host);
  }
}

/** Il degrado: quando la catena dati fallisce, officialPage DEVE tornare. */
export function expectDegradation(response: SearchResponse): void {
  expect(response.financials?.available ?? false).toBe(false);
  expect(response.officialPage).toBeDefined();
  expect(response.officialPage?.url).toMatch(/^https:\/\//);
}

describe("helper della regola d'oro", () => {
  it("expectGoldenRule accetta una risposta senza officialPage né host di registro", () => {
    const clean: SearchResponse = {
      found: true,
      sources: [],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: {
        available: true,
        years: [],
        documents: [
          {
            id: "SK-1",
            year: 2024,
            kind: "ANNUAL_REPORT",
            format: "pdf",
            availability: "DOCUMENT_DOWNLOADABLE",
            downloadUrl: "/api/company-finder/ruz-document?attachment=1",
          },
        ],
      },
    };
    expect(() => expectGoldenRule(clean)).not.toThrow();
  });

  it("expectGoldenRule rifiuta una risposta con officialPage", () => {
    const leaky: SearchResponse = {
      found: true,
      sources: [],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      officialPage: {
        url: "https://www.registeruz.sk/cruz-public/",
        label: "RÚZ",
        note: "consultazione",
      },
    };
    expect(() => expectGoldenRule(leaky)).toThrow();
  });

  it("expectGoldenRule rifiuta un host di registro nascosto in una nota", () => {
    const leaky: SearchResponse = {
      found: true,
      sources: [],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: {
        available: true,
        years: [],
        note: "Documento da registeruz.sk",
      },
    };
    expect(() => expectGoldenRule(leaky)).toThrow();
  });

  it("expectDegradation richiede officialPage quando i dati non sono disponibili", () => {
    const degraded: SearchResponse = {
      found: true,
      sources: [],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: { available: false, years: [] },
      officialPage: {
        url: "https://www.registeruz.sk/cruz-public/",
        label: "RÚZ",
        note: "consultazione",
      },
    };
    expect(() => expectDegradation(degraded)).not.toThrow();
  });
});

describe("prioritizeBalanceDocument — officialPage condizionale", () => {
  it("rimuove officialPage quando il bilancio è disponibile", async () => {
    const { prioritizeBalanceDocumentForTest } =
      await import("../src/lib/company-finder.functions");
    const withData: SearchResponse = {
      found: true,
      sources: [],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: {
        available: true,
        years: [{ periodLabel: "Esercizio 2024", year: 2024, currency: "EUR" }],
        documents: [
          {
            id: "SK-1",
            year: 2024,
            kind: "ANNUAL_REPORT",
            format: "pdf",
            availability: "DOCUMENT_DOWNLOADABLE",
            downloadUrl: "/api/company-finder/ruz-document?attachment=1",
          },
        ],
      },
      officialPage: {
        url: "https://www.registeruz.sk/cruz-public/",
        label: "RÚZ",
        note: "consultazione",
      },
    };
    const result = await prioritizeBalanceDocumentForTest(withData, "12345678");
    expectGoldenRule(result);
  });

  it("conserva officialPage quando il bilancio NON è disponibile", async () => {
    const { prioritizeBalanceDocumentForTest } =
      await import("../src/lib/company-finder.functions");
    const withoutData: SearchResponse = {
      found: true,
      sources: [],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: { available: false, years: [] },
      officialPage: {
        url: "https://www.registeruz.sk/cruz-public/",
        label: "RÚZ",
        note: "consultazione",
      },
    };
    const result = await prioritizeBalanceDocumentForTest(withoutData, "12345678");
    expectDegradation(result);
  });
});

describe("Slovacchia — stato della regola d'oro", () => {
  it("una risposta SK con allegati scaricabili non espone la fonte", () => {
    const skResponse: SearchResponse = {
      found: true,
      sources: [{ id: "ruz-sk", label: "RÚZ", state: "ok" }],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: {
        available: true,
        years: [{ periodLabel: "Esercizio 2024", year: 2024, currency: "EUR" }],
        documents: [
          {
            id: "SK-2024",
            year: 2024,
            kind: "ANNUAL_REPORT",
            format: "pdf",
            availability: "DOCUMENT_DOWNLOADABLE",
            downloadUrl: "/api/company-finder/ruz-document?attachment=99",
          },
        ],
      },
    };
    expectGoldenRule(skResponse);
  });
});

describe("Grecia — coperta dal passaggio centrale", () => {
  it("MECCANISMO: un documentUrl già fornito viene incapsulato e officialPage sparisce (non prova la risoluzione live del portale GEMI)", async () => {
    const { prioritizeBalanceDocumentForTest } =
      await import("../src/lib/company-finder.functions");
    stubGreekPortalWithoutFilingLink();
    const grResponse: SearchResponse = {
      found: true,
      sources: [{ id: "gemi", label: "ΓΕΜΗ", state: "ok" }],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: {
        available: true,
        years: [],
        documentUrl: "https://filings.businessportal.gr/filing/123.pdf",
      },
      officialPage: {
        url: "https://publicity.businessportal.gr/",
        label: "ΓΕΜΗ",
        note: "consultazione",
      },
    };
    const result = await prioritizeBalanceDocumentForTest(grResponse, "1234567890");
    expectGoldenRule(result);
  });

  it("DEGRADO (comportamento reale in produzione): senza documentUrl né allegati scaricabili, officialPage torna — la pagina di publicity.businessportal.gr è una SPA Angular e il markup server-side non espone mai il link del bilancio", async () => {
    const { prioritizeBalanceDocumentForTest } =
      await import("../src/lib/company-finder.functions");
    stubGreekPortalWithoutFilingLink();
    const country = getCountry("GR");
    if (!country) throw new Error("catalogo paesi privo di GR");
    const grResponse: SearchResponse = {
      found: true,
      company: {
        name: "Società Ellenica Esempio",
        country,
        registry: {
          name: country.registryName,
          authority: country.registryAuthority,
          id: "1234567890",
        },
      },
      sources: [
        { id: "gemi", label: "ΓΕΜΗ", state: "failed", detail: "link non estraibile dalla SPA" },
      ],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: { available: false, years: [] },
      officialPage: {
        url: "https://publicity.businessportal.gr/",
        label: "ΓΕΜΗ",
        note: "consultazione",
      },
    };
    const result = await prioritizeBalanceDocumentForTest(grResponse, "1234567890");
    expectDegradation(result);
  });
});

describe("Belgio — senza chiave NBB-CBSO resta in consultazione", () => {
  it("degrada a officialPage quando il bilancio non è disponibile", async () => {
    const { prioritizeBalanceDocumentForTest } =
      await import("../src/lib/company-finder.functions");
    const beResponse: SearchResponse = {
      found: true,
      sources: [{ id: "cbso", label: "NBB CBSO", state: "failed", detail: "chiave assente" }],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: { available: false, years: [] },
      officialPage: {
        url: "https://consult.cbso.nbb.be/",
        label: "Centrale dei bilanci — Banca nazionale del Belgio",
        note: "consultazione",
      },
    };
    const result = await prioritizeBalanceDocumentForTest(beResponse, "0417497106");
    expectDegradation(result);
  });
});
