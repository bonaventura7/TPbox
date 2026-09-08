import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchGermanyPublicBalance } from "../src/lib/company-finder/sources/bilanci/germany-public-balance";

afterEach(() => vi.unstubAllGlobals());

describe("German public balance fallback", () => {
  it("finds a public balance page and extracts downloadable balance data", async () => {
    const searchHtml = `
      <html><a href="https://www.unternehmen24.info/Firmeninformationen/Deutschland/Firma/5064652">ORI MARTIN Deutschland GmbH</a></html>
    `;
    const pageHtml = `
      <html><body>
        <h1>ORI MARTIN Deutschland GmbH</h1>
        <div>Bilanzsumme 2024 668.995 €</div>
        <div>Bilanzsumme 668.995 €</div>
        <div>Gewinn 332.338 €</div>
        <div>Aktiva</div><div>Anlagevermögen 54.534 €</div><div>Sachanlagen 53.648 €</div><div>Umlaufvermögen 609.807 €</div>
        <div>Forderungen und sonstige Vermögensgegenstände 212.253 €</div>
        <div>Kassenbestand, Guthaben bei Kreditinstituten und Schecks 397.554 €</div>
        <div>Summe Aktiva 668.995 €</div>
        <div>Passiva gesamt 668.995 €</div><div>Eigenkapital 494.125 €</div><div>Gezeichnetes Kapital 80.000 €</div>
        <div>Bilanzgewinn 414.125 €</div><div>Gewinnvortrag 81.787 €</div><div>Jahresüberschuss 332.338 €</div>
        <div>Rückstellungen 154.225 €</div><div>Verbindlichkeiten 20.644 €</div><div>Summe Passiva 668.995 €</div>
        <div>Jahresabschluss vom 06.02.2026</div>
      </body></html>
    `;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("html.duckduckgo.com/html")) {
          return { ok: true, status: 200, text: async () => searchHtml } as unknown as Response;
        }
        if (url.includes("unternehmen24.info/Firmeninformationen/Deutschland/Firma/5064652")) {
          return { ok: true, status: 200, text: async () => pageHtml } as unknown as Response;
        }
        throw new Error(`unexpected URL ${url}`);
      }),
    );

    const result = await fetchGermanyPublicBalance("ORI MARTIN Deutschland GmbH");

    expect(result.ok).toBe(true);
    expect(result.data?.available).toBe(true);
    expect(result.data?.documents?.[0]).toMatchObject({
      year: 2024,
      availability: "DOCUMENT_DOWNLOADABLE",
      format: "csv",
    });
    expect(result.data?.years[0]).toMatchObject({
      year: 2024,
      totalAssets: 668995,
      equity: 494125,
      liabilitiesAndEquity: 668995,
      netIncome: 332338,
      currency: "EUR",
    });
    expect(result.data?.documents?.[0]?.downloadUrl).toContain("/api/company-finder/germany-public-balance?");
  });
});
