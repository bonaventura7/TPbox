import { afterEach, describe, expect, it, vi } from "vitest";

import { searchUrAccounting } from "../src/lib/company-finder/sources/bilanci/ur-de";

afterEach(() => vi.unstubAllGlobals());

describe("German company resolver", () => {
  it("resolves a short query such as TOZ to the legal German name before balance lookup", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        seen.push(url);
        if (url.startsWith("https://api.firmendata.com/v1/companies/autocomplete?")) {
          const headers = new Headers(init?.headers);
          expect(headers.get("authorization")).toBeNull();
          const parsed = new URL(url);
          expect(parsed.searchParams.get("q")).toBe("TOZ");
          return new Response(
            JSON.stringify({
              data: [
                { eu_id: "DEMO.TOZ", display_name: "TOZ Physiotherapie GmbH", legal_name: "TOZ Physiotherapie GmbH" },
                { eu_id: "DEMO.TOZ2", display_name: "TOZ Holding GmbH", legal_name: "TOZ Holding GmbH" },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.startsWith("https://html.duckduckgo.com/html/?q=")) {
          expect(decodeURIComponent(url)).toContain('"TOZ Physiotherapie GmbH"');
          return new Response(
            '<a href="https://www.unternehmen24.info/Firmeninformationen/Deutschland/Firma/1234567">TOZ Physiotherapie GmbH</a>',
            { status: 200 },
          );
        }
        if (url === "https://www.unternehmen24.info/Firmeninformationen/Deutschland/Firma/1234567") {
          return new Response(
            '<html><body><h1>TOZ Physiotherapie GmbH</h1><div>Jahresabschluss 2024</div><div>Summe Aktiva 125.000 €</div><div>Eigenkapital 75.000 €</div><div>Jahresüberschuss 12.000 €</div><div>Summe Passiva 125.000 €</div></body></html>',
            { status: 200 },
          );
        }
        throw new Error(`unexpected URL ${url}`);
      }),
    );

    const result = await searchUrAccounting("TOZ", 10000);

    expect(result.ok).toBe(true);
    expect(result.data?.years[0]).toMatchObject({
      year: 2024,
      totalAssets: 125000,
      equity: 75000,
      liabilitiesAndEquity: 125000,
      netIncome: 12000,
    });
    expect(seen.some((url) => url.includes("api.firmendata.com"))).toBe(true);
    expect(seen.some((url) => url.includes("TOZ%20Physiotherapie%20GmbH"))).toBe(true);
  });

  it("prefers an exact legal-name match for Siemens AG", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.startsWith("https://api.firmendata.com/v1/companies/autocomplete?")) {
          return new Response(
            JSON.stringify({
              data: [
                { eu_id: "DEMO.SIEMENS1", display_name: "Siemens Industry Software GmbH", legal_name: "Siemens Industry Software GmbH" },
                { eu_id: "DEMO.SIEMENS2", display_name: "Siemens Aktiengesellschaft", legal_name: "Siemens Aktiengesellschaft" },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.startsWith("https://html.duckduckgo.com/html/?q=")) {
          expect(decodeURIComponent(url)).toContain('"Siemens Aktiengesellschaft"');
          return new Response(
            '<a href="https://www.unternehmen24.info/Firmeninformationen/Deutschland/Firma/7654321">Siemens Aktiengesellschaft</a>',
            { status: 200 },
          );
        }
        if (url.endsWith("/Firma/7654321")) {
          return new Response(
            '<html><body>Siemens Aktiengesellschaft Jahresabschluss 2024 Summe Aktiva 10.000.000 € Eigenkapital 4.000.000 € Jahresüberschuss 500.000 € Summe Passiva 10.000.000 €</body></html>',
            { status: 200 },
          );
        }
        throw new Error(`unexpected URL ${url}`);
      }),
    );

    const result = await searchUrAccounting("Siemens AG", 10000);
    expect(result.ok).toBe(true);
    expect(result.data?.years[0]?.year).toBe(2024);
    expect(result.data?.years[0]?.totalAssets).toBe(10000000);
  });
});
