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
    // Gli importi del payload sono in centesimi: l'adapter li converte in euro.
    // L'attesa e' scritta come divisione per rendere visibile la conversione.
    expect(result.data?.years[0]).toMatchObject({
      year: 2024,
      revenue: 23456789 / 100,
      operatingProfit: 987654 / 100,
      netIncome: 654321 / 100,
      totalAssets: 12345678 / 100,
      equity: 3456789 / 100,
      liabilitiesAndEquity: 12345678 / 100,
      currency: "EUR",
    });
    expect(requests.every((request) => request.authorization === "Bearer test-key")).toBe(true);
    expect(requests.some((request) => request.url.includes("/v0/search/company"))).toBe(false);
  });

  // Regressione sul fattore di scala. OpenRegister espone gli importi in centesimi
  // e non dichiara l'unita': il payload non contiene `unit`, `currency` ne' `EUR`.
  // Prima della correzione il tool mostrava BASF SE con un fatturato di 5,97 mila
  // miliardi di euro, superiore al PIL tedesco.
  //
  // Il payload qui sotto e' registrato da una misura reale del 2026-09-17 su
  // DE-HRB-T3104-6000, esercizio chiuso al 2025-12-31. Non fa chiamate live: la
  // chiave OpenRegister risponde 403 dopo circa 8 richieste ravvicinate.
  //
  // Cosa NON prova: che OpenRegister continuera' a usare i centesimi. Prova solo
  // che l'adapter converte. Se la fonte cambiasse unita', questo test resterebbe
  // verde ed e' la matrice delle fonti a doverlo intercettare.
  it("converte gli importi da centesimi a euro (misura BASF SE)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);

        if (url.includes("/v1/autocomplete/company?")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  company_id: "DE-HRB-T3104-6000",
                  name: "BASF SE",
                  country: "DE",
                  legal_form: "se",
                },
              ],
            }),
          } as unknown as Response;
        }

        if (url.endsWith("/v1/company/DE-HRB-T3104-6000/financials")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              reports: [],
              indicators: [
                {
                  date: "2025-12-31",
                  revenue: 5965700000000,
                  balance_sheet_total: 7617400000000,
                  equity: 3433800000000,
                  net_income: 172600000000,
                  employees: 105588,
                },
              ],
            }),
          } as unknown as Response;
        }

        throw new Error(`unexpected URL ${url}`);
      }),
    );

    const result = await fetchOpenRegisterFinancials("BASF SE", "test-key");
    const year = result.data?.years[0];

    // Valori del bilancio BASF SE 2025, in euro.
    expect(year?.revenue).toBe(59_657_000_000);
    expect(year?.totalAssets).toBe(76_174_000_000);
    expect(year?.equity).toBe(34_338_000_000);
    expect(year?.netIncome).toBe(1_726_000_000);

    // La riga che sarebbe passata prima del fix: 5,97 mila miliardi.
    expect(year?.revenue).not.toBe(5_965_700_000_000);
  });
});
