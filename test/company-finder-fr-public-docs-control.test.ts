import { describe, expect, it, vi, afterEach } from "vitest";
import { searchRechercheEntreprises } from "../src/lib/company-finder/sources/recherche-entreprises-fr";

const FR_JSON = {
  results: [
    {
      siren: "393602685",
      nom_complet: "TOD'S FRANCE",
      etat_administratif: "A",
      siege: { adresse: "22 RUE DU GENERAL FOY 75008 PARIS", siret: "39360268500223" },
      finances: { "2024": { ca: 29562056, resultat_net: 457326 } },
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("France public financial lookup latency control", () => {
  it("can resolve state financials without performing the slow document discovery", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(FR_JSON), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchRechercheEntreprises("TOD'S France", "", 12000, {
      includePublicDocuments: false,
    });

    expect(result.ok).toBe(true);
    expect(result.financials?.years[0]?.revenue).toBe(29562056);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
