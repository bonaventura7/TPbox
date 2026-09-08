import { afterEach, describe, expect, it, vi } from "vitest";

import { searchUrAccounting } from "../src/lib/company-finder/sources/bilanci/ur-de";

afterEach(() => vi.unstubAllGlobals());

describe("Unternehmensregister current search contract", () => {
  it("accepts the current areas/companySearchTerm search and payload publication URL", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.endsWith("/api/search-token")) {
          return { ok: true, status: 200, json: async () => ({ token: "token" }) } as unknown as Response;
        }
        if (url.includes("/de/suche?areas=all")) {
          const html = `self.__next_f.push([1,"{\\"companyDto\\":{\\"name\\":\\"ORI MARTIN GMBH\\"},\\"publicationDto\\":{\\"companyNameAtTimeOfPublication\\":\\"ORI MARTIN GMBH\\",\\"title\\":\\"Jahresabschluss zum Geschäftsjahr 2024\\",\\"sourceDate\\":\\"2026-06-16\\",\\"hasPdf\\":true,\\"payload\\":\\"abc123\\"}}"])`;
          return { ok: true, status: 200, text: async () => html } as unknown as Response;
        }
        throw new Error(`unexpected URL ${url}`);
      }),
    );

    const result = await searchUrAccounting("ORI MARTIN GMBH");

    expect(urls.some((url) => url.includes("areas=all") && url.includes("companySearchTerm=ORI%20MARTIN%20GMBH"))).toBe(true);
    expect(result.data?.available).toBe(true);
    expect(result.data?.documentUrl).toContain("payload=abc123");
  });
});
