import { afterEach, describe, expect, it, vi } from "vitest";

import { searchUrAccounting } from "../src/lib/company-finder/sources/bilanci/ur-de";

afterEach(() => vi.unstubAllGlobals());

describe("Unternehmensregister current search contract", () => {
  it("bootstraps the registry session and returns the official publication reference", async () => {
    const requests: Array<{ url: string; cookie?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        requests.push({ url, cookie: headers.get("cookie") ?? undefined });

        if (url.endsWith("/de/suche")) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "set-cookie": "URINIT=init-123; Path=/; HttpOnly" }),
            text: async () => "<html></html>",
          } as unknown as Response;
        }

        if (url.endsWith("/api/search-token")) {
          expect(headers.get("cookie")).toContain("URINIT=init-123");
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "set-cookie": "URSESSION=session-123; Path=/; HttpOnly" }),
            json: async () => ({ token: "token" }),
          } as unknown as Response;
        }

        if (url.includes("/de/suche?areas=all")) {
          expect(headers.get("cookie")).toContain("URINIT=init-123");
          expect(headers.get("cookie")).toContain("URSESSION=session-123");
          const parsed = new URL(url);
          expect(parsed.searchParams.get("companySearchTerm")).toBe("ORI MARTIN GMBH");
          expect(parsed.searchParams.get("companyName")).toBe("ORI MARTIN GMBH");
          const html = `self.__next_f.push([1,"{\\"companyDto\\":{\\"name\\":\\"ORI MARTIN GMBH\\"},\\"publicationDto\\":{\\"companyNameAtTimeOfPublication\\":\\"ORI MARTIN GMBH\\",\\"title\\":\\"Jahresabschluss zum Geschäftsjahr 2024\\",\\"sourceDate\\":\\"2026-06-16\\",\\"hasPdf\\":true,\\"payload\\":\\"abc123\\"}}"])`;
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "set-cookie": "URSEARCH=search-456; Path=/; HttpOnly" }),
            text: async () => html,
          } as unknown as Response;
        }

        throw new Error(`unexpected URL ${url}`);
      }),
    );

    const result = await searchUrAccounting("ORI MARTIN GMBH");

    expect(requests.some((r) => r.url.includes("areas=all"))).toBe(true);
    expect(result.data?.available).toBe(true);
    expect(result.data?.documentUrl).toContain("/api/company-finder/document?url=");
    expect(result.data?.documentUrl).toContain("veroeffentlichung");
  });
});
