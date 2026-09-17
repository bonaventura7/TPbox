import { describe, expect, it } from "vitest";

import type { SearchResponse } from "../src/lib/company-finder/types";

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
