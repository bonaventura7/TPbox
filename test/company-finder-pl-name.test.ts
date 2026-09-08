import { afterEach, describe, expect, it, vi } from "vitest";

import { resolvePolishKrsByName } from "../src/lib/company-finder.functions";
import { searchGleif } from "../src/lib/company-finder/sources/gleif";

afterEach(() => vi.unstubAllGlobals());

describe("Polonia — risoluzione nome → KRS", () => {
  it("uses only GLEIF records registered at the Polish KRS authority", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                attributes: {
                  lei: "529900TESTLEI00000001",
                  entity: {
                    legalName: { name: "MASPEX HOLDING SPÓŁKA AKCYJNA" },
                    legalAddress: { country: "PL", city: "WADOWICE" },
                    registeredAs: "0000725647",
                    registeredAt: { id: "RA000484" },
                    status: "ACTIVE",
                  },
                },
              },
              {
                attributes: {
                  lei: "529900TESTLEI00000002",
                  entity: {
                    legalName: { name: "MASPEX HOLDING SPÓŁKA AKCYJNA" },
                    legalAddress: { country: "PL", city: "WADOWICE" },
                    registeredAs: "5512634704",
                    registeredAt: { id: "RA000654" },
                    status: "ACTIVE",
                  },
                },
              },
            ],
          }),
        }) as unknown as Response,
      ),
    );

    const result = await resolvePolishKrsByName("Maspex Holding");
    expect(result.krs).toBe("0000725647");
    expect(result.detail).toContain("RA000484");
  });

  it("refuses a Polish entity whose registered identifier belongs to another authority", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                attributes: {
                  lei: "529900TESTLEI00000003",
                  entity: {
                    legalName: { name: "ACME POLSKA" },
                    legalAddress: { country: "PL" },
                    registeredAs: "123456789",
                    registeredAt: { id: "RA000654" },
                    status: "ACTIVE",
                  },
                },
              },
            ],
          }),
        }) as unknown as Response,
      ),
    );

    const result = await resolvePolishKrsByName("ACME POLSKA");
    expect(result.krs).toBeUndefined();
    expect(result.detail).toContain("Registered At KRS");
  });

  it("parses and exposes registeredAt while retaining existing relevance filtering", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                attributes: {
                  lei: "529900TESTLEI00000004",
                  entity: {
                    legalName: { name: "MASPEX HOLDING SPÓŁKA AKCYJNA" },
                    legalAddress: { country: "PL" },
                    registeredAs: "0000725647",
                    registeredAt: { id: "RA000484" },
                    status: "ACTIVE",
                  },
                },
              },
            ],
          }),
        }) as unknown as Response,
      ),
    );

    const result = await searchGleif("Maspex Holding", "PL");
    expect(result.ok).toBe(true);
    expect(result.matches[0]?.registeredAt).toBe("RA000484");
    expect(result.matches[0]?.registeredAs).toBe("0000725647");
  });
});
