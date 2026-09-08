import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchOpenRegisterFinancials } from "../src/lib/company-finder/sources/bilanci/openregister-de";

afterEach(() => vi.unstubAllGlobals());

describe("OpenRegister German financials", () => {
  it("uses the current v1 autocomplete contract and maps structured indicators", async () => {
    const requests: Array<{ url: string; authorization?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        requests.push({ url, authorization: headers.get("authorization") ?? undefined });

        if (url.includes("/v1/autocomplete/company?")) {
          const parsed = new URL(url);
          expect(parsed.searchParams.get("query")).toBe("ORI MARTIN GMBH");
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  company_id: "DE-HRB-F1103-267645",
                  name: "ORI MARTIN Deutschland GmbH",
                  country: "DE",
                  register_number: "HRB 12345",
                },
              ],
            }),
          } as unknown as Response;
        }

        if (url.endsWith("/v1/company/DE-HRB-F1103-267645/financials")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              reports: [
                {
                  report_id: "r-2024",
                  report_start_date: "2024-01-01",
                  report_end_date: "2024-12-31",
                  sources: [{ html_url: "https://example.test/report-2024" }],
                },
              ],
              indicators: [
                {
                  date: "2024-12-31",
                  balance_sheet_total: 12345678,
                  net_income: 654321,
                  ebit: 987654,
                  revenue: 23456789,
                  equity: 3456789,
                  liabilities: 8888889,
                },
              ],
            }),
          } as unknown as Response;
        }

        throw new Error(`unexpected URL ${url}`);
      }),
    );

    const result = await fetchOpenRegisterFinancials("ORI MARTIN GMBH", "test-key");

    expect(result.ok).toBe(true);
    expect(result.data?.available).toBe(true);
    expect(result.data?.source).toBe("OpenRegister / Bundesanzeiger (DE)");
    expect(result.data?.years).toHaveLength(1);
    expect(result.data?.years[0]).toMatchObject({
      year: 2024,
      revenue: 23456789,
      operatingProfit: 987654,
      netIncome: 654321,
      totalAssets: 12345678,
      equity: 3456789,
      liabilitiesAndEquity: 12345678,
      currency: "EUR",
    });
    expect(requests.every((request) => request.authorization === "Bearer test-key")).toBe(true);
    expect(requests.some((request) => request.url.includes("/v0/search/company"))).toBe(false);
  });
});
