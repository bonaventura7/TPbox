import { afterEach, describe, expect, it, vi } from "vitest";

import { attachNorwayFinancials } from "../src/lib/company-finder.functions";
import { getCountry } from "../src/lib/company-finder/countries";
import { isCovered } from "../src/lib/company-finder/coverage";
import type { SearchResponse } from "../src/lib/company-finder/types";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function baseNorwayResponse(identifier = "123456789"): SearchResponse {
  return {
    found: true,
    company: {
      name: "Example Norway AS",
      country: getCountry("NO")!,
      registry: {
        name: "Enhetsregisteret",
        authority: "Skatteetaten (Norway)",
        id: `org.nr ${identifier}`,
      },
    },
    sources: [],
    warnings: [],
    searchedAt: new Date().toISOString(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Norway — Company Finder integration", () => {
  it("marks Norway as automatically covered", () => {
    expect(isCovered("NO")).toBe(true);
  });

  it("attaches official annual-report documents when the org.nr is available", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ aar: [2025, 2024] })));
    const response = await attachNorwayFinancials(baseNorwayResponse(), "NO123456789");

    expect(response.financials).toMatchObject({
      available: true,
      currency: "NOK",
      availability: "DOCUMENT_DOWNLOADABLE",
      documentUrl: "/api/company-finder/document?country=NO&company=123456789&year=2025",
    });
    expect(response.financials?.documents).toHaveLength(2);
    expect(response.financials?.documents?.[0]?.downloadUrl).toBe(
      "/api/company-finder/document?country=NO&company=123456789&year=2025&download=1",
    );
    expect(response.company?.country.financials.free).toBe(true);
  });

  it("can resolve the org.nr from the registry id after a name lookup", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ aar: [2024] })));
    const response = await attachNorwayFinancials(baseNorwayResponse("987654321"), "");
    expect(response.financials?.documents?.[0]?.year).toBe(2024);
  });

  it("does not invent annual reports when no org.nr can be resolved", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const response = await attachNorwayFinancials(baseNorwayResponse(""), "Example Norway AS");
    expect(response.financials).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
