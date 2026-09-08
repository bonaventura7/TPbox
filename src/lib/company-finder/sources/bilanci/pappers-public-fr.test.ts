import { describe, expect, it, vi } from "vitest";

import {
  findPappersAnnualReports,
  toInternalPappersDocuments,
  withPappersDocuments,
} from "./pappers-public-fr.server";
import type { Financials } from "../../types";

const fixture = `<!doctype html><html><body>
<a href="/entreprise/acme-123456789/comptes/Acme - Comptes sociaux 2024 10-04-2025.pdf">Comptes sociaux 2024</a>
<a href="/entreprise/acme-123456789/comptes/Acme - Comptes sociaux 2023 08-04-2024.pdf">Comptes sociaux 2023</a>
</body></html>`;

describe("Pappers public FR annual reports", () => {
  it("extracts annual-report PDF links without an API key", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () =>
        new Response(fixture, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    ) as typeof fetch;

    try {
      const result = await findPappersAnnualReports("ACME SAS", "123456789");
      expect(result.ok).toBe(true);
      expect(result.documents?.map((item) => item.year)).toEqual([2024, 2023]);
      expect(result.documents?.[0]?.url).toContain(
        "www.pappers.fr/entreprise/acme-123456789/comptes/",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reports the explicit unavailability message", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () =>
        new Response("<html><body>Ce document n'est pas disponible pour le moment</body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    ) as typeof fetch;

    try {
      const result = await findPappersAnnualReports("ACME SAS", "123456789");
      expect(result.ok).toBe(false);
      expect(result.restriction).toBe("SOURCE_UNAVAILABLE");
      expect(result.error).toContain("non è disponibile");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("only exposes internal TPbox download URLs to the client model", () => {
    const docs = toInternalPappersDocuments("ACME SAS", "123456789", [
      {
        url: "https://www.pappers.fr/entreprise/acme-123456789/comptes/Acme.pdf",
        title: "Comptes sociaux 2024",
        year: 2024,
      },
    ]);
    expect(docs[0]?.downloadUrl).toBe(
      "/api/company-finder/document?country=FR&company=ACME%20SAS&siren=123456789&year=2024",
    );
    expect(docs[0]?.downloadUrl).not.toContain("pappers.fr");
  });

  it("merges downloadable documents into the financial result selected by the orchestrator", () => {
    const base: Financials = {
      available: true,
      currency: "EUR",
      years: [
        {
          periodLabel: "Esercizio 2024",
          revenue: 100,
          currency: "EUR",
        },
      ],
      source: "Recherche d'entreprises — Stato francese",
    };

    const merged = withPappersDocuments(base, "ACME SAS", "123456789", [
      {
        url: "https://www.pappers.fr/entreprise/acme-123456789/comptes/Acme.pdf",
        title: "Comptes sociaux 2024",
        year: 2024,
      },
    ]);

    expect(merged.available).toBe(true);
    expect(merged.years).toEqual(base.years);
    expect(merged.availability).toBe("DOCUMENT_DOWNLOADABLE");
    expect(merged.documents).toHaveLength(1);
    expect(merged.documents?.[0]?.downloadUrl).toBe(
      "/api/company-finder/document?country=FR&company=ACME%20SAS&siren=123456789&year=2024",
    );
  });
});
