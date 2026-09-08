import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchGermanyPublicBalance } from "../src/lib/company-finder/sources/bilanci/germany-public-balance";

afterEach(() => vi.unstubAllGlobals());

function pageHtml(company: string, year: number, total: string): string {
  return `<html><body>
    <h1>${company}</h1>
    <div>Jahresabschluss zum Geschäftsjahr vom 01.01.${year} bis zum 31.12.${year}</div>
    <div>Summe Aktiva ${total} €</div><div>Eigenkapital 494.125 €</div><div>Jahresüberschuss 332.338 €</div><div>Summe Passiva ${total} €</div>
  </body></html>`;
}

describe("German public balance fallback", () => {
  it("finds a public balance page and extracts downloadable balance data", async () => {
    const searchHtml = `<html><a href="https://www.unternehmen24.info/Firmeninformationen/Deutschland/Firma/5064652">ORI MARTIN Deutschland GmbH</a></html>`;
    const sourceUrl = "https://www.unternehmen24.info/Firmeninformationen/Deutschland/Firma/5064652";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("html.duckduckgo.com/html")) return { ok: true, status: 200, text: async () => searchHtml } as unknown as Response;
      if (url === sourceUrl) return { ok: true, status: 200, text: async () => pageHtml("ORI MARTIN Deutschland GmbH", 2024, "668.995") } as unknown as Response;
      throw new Error(`unexpected URL ${url}`);
    }));

    const result = await fetchGermanyPublicBalance("ORI MARTIN Deutschland GmbH");
    expect(result.ok).toBe(true);
    expect(result.data?.available).toBe(true);
    expect(result.data?.documents?.[0]).toMatchObject({ year: 2024, availability: "DOCUMENT_DOWNLOADABLE", format: "csv" });
    expect(result.data?.years[0]).toMatchObject({ year: 2024, totalAssets: 668995, equity: 494125, liabilitiesAndEquity: 668995, netIncome: 332338, currency: "EUR" });
    expect(result.data?.documents?.[0]?.downloadUrl).toContain("/api/company-finder/germany-public-balance?");
  });

  it("selects the result whose displayed name matches the requested company", async () => {
    const wrong = "https://www.unternehmen24.info/Firmeninformationen/Deutschland/Firma/1111111";
    const right = "https://www.unternehmen24.info/Firmeninformationen/Deutschland/Firma/5064652";
    const searchHtml = `
      <a href="${wrong}">ORI MARTIN Holding GmbH</a>
      <a href="${right}">ORI MARTIN Deutschland GmbH</a>
    `;
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("html.duckduckgo.com/html")) return { ok: true, status: 200, text: async () => searchHtml } as unknown as Response;
      if (url === right) return { ok: true, status: 200, text: async () => pageHtml("ORI MARTIN Deutschland GmbH", 2024, "668.995") } as unknown as Response;
      if (url === wrong) return { ok: true, status: 200, text: async () => pageHtml("ORI MARTIN Holding GmbH", 2023, "999.999") } as unknown as Response;
      throw new Error(`unexpected URL ${url}`);
    }));

    const result = await fetchGermanyPublicBalance("ORI MARTIN Deutschland GmbH");
    expect(result.ok).toBe(true);
    expect(seen).toContain(right);
    expect(seen).not.toContain(wrong);
    expect(result.data?.years[0]?.year).toBe(2024);
  });
});
