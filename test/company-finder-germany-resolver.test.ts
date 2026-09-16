import { afterEach, describe, expect, it, vi } from "vitest";

import { searchGermanyAdapter } from "../src/lib/company-finder/sources/germany-adapter";
import { resolveGermanyCompanyName, searchUrAccounting } from "../src/lib/company-finder/sources/bilanci/ur-de";

const AUTOCOMPLETE = "https://api.firmendata.com/v1/companies/autocomplete?";

/** Host della catena di ripiego ritirata: nessuno di questi va piu' interrogato. */
const RETIRED_HOSTS = ["duckduckgo.com", "unternehmen24.info", "google.com", "bing.com"];

function firmendataResponse(rows: Array<{ eu_id: string; legal_name: string }>): Response {
  return new Response(
    JSON.stringify({ data: rows.map((row) => ({ ...row, display_name: row.legal_name })) }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["OPENREGISTER_API_KEY"];
});

describe("resolver societario tedesco", () => {
  it("risolve una sigla breve nella ragione sociale tedesca completa", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.startsWith(AUTOCOMPLETE)) {
          expect(new URL(url).searchParams.get("q")).toBe("TOZ Physiotherapie");
          return firmendataResponse([
            { eu_id: "DEMO.TOZ", legal_name: "TOZ Physiotherapie GmbH" },
            { eu_id: "DEMO.TOZ2", legal_name: "TOZ Holding GmbH" },
          ]);
        }
        throw new Error(`unexpected URL ${url}`);
      }),
    );

    const resolved = await resolveGermanyCompanyName("TOZ Physiotherapie", 10000);

    expect(resolved?.name).toBe("TOZ Physiotherapie GmbH");
    expect(resolved?.euId).toBe("DEMO.TOZ");
  });

  it("preferisce la corrispondenza esatta sulla ragione sociale", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.startsWith(AUTOCOMPLETE)) {
          return firmendataResponse([
            { eu_id: "DEMO.SIEMENS1", legal_name: "Siemens Industry Software GmbH" },
            { eu_id: "DEMO.SIEMENS2", legal_name: "Siemens Aktiengesellschaft" },
          ]);
        }
        throw new Error(`unexpected URL ${url}`);
      }),
    );

    const resolved = await resolveGermanyCompanyName("Siemens Aktiengesellschaft", 10000);

    expect(resolved?.name).toBe("Siemens Aktiengesellschaft");
    expect(resolved?.euId).toBe("DEMO.SIEMENS2");
  });
});

describe("adapter tedesco dopo il ritiro della catena sui motori di ricerca", () => {
  it("dichiara il bilancio indisponibile invece di ricostruirlo da pagine terze", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        seen.push(url);
        if (url.startsWith(AUTOCOMPLETE)) {
          return firmendataResponse([{ eu_id: "DEMO.TOZ", legal_name: "TOZ Physiotherapie GmbH" }]);
        }
        throw new Error(`unexpected URL ${url}`);
      }),
    );

    const result = await searchGermanyAdapter({ query: "TOZ Physiotherapie" }, 10000);

    expect(result.ok).toBe(false);
    expect(result.financials).toBeUndefined();
    for (const host of RETIRED_HOSTS) {
      expect(seen.some((url) => url.includes(host))).toBe(false);
    }
  });

  it("non interroga alcuna fonte di ripiego quando il resolver non trova la societa'", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        seen.push(url);
        if (url.startsWith(AUTOCOMPLETE)) return firmendataResponse([]);
        throw new Error(`unexpected URL ${url}`);
      }),
    );

    const result = await searchUrAccounting("Societa Inesistente GmbH", 10000);

    expect(result.ok).toBe(false);
    expect(seen.every((url) => url.startsWith(AUTOCOMPLETE))).toBe(true);
  });
});
