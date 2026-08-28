import { afterEach, describe, expect, it, vi } from "vitest";

import { numericRegistryId, searchGleif } from "../src/lib/company-finder/sources/gleif";

/** Risposta reale di api.gleif.org, ridotta a un record. */
const GLEIF_RESPONSE = {
  data: [
    {
      attributes: {
        lei: "5299001O0WJQ2CJP5B67",
        entity: {
          legalName: { name: "CARLSBERG A/S" },
          legalAddress: {
            addressLines: ["Ny Carlsberg Vej 100"],
            city: "København V",
            postalCode: "1799",
            country: "DK",
          },
          registeredAs: "61056416",
          status: "ACTIVE",
        },
      },
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("GLEIF — nome società verso identificativo di registro", () => {
  it("estrae paese e identificativo nazionale dal record LEI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({ ok: true, status: 200, json: async () => GLEIF_RESPONSE }) as unknown as Response,
      ),
    );
    const r = await searchGleif("Carlsberg A/S", "DK");
    expect(r.ok).toBe(true);
    expect(r.matches[0]?.country).toBe("DK");
    expect(r.matches[0]?.registeredAs).toBe("61056416");
    expect(r.matches[0]?.address).toContain("københavn");
  });

  it("filtra per paese quando indicato", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({ ok: true, status: 200, json: async () => GLEIF_RESPONSE }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);
    await searchGleif("Carlsberg A/S", "DK");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("legalAddress.country");
  });

  it("rifiuta nomi troppo corti senza chiamare la rete", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await searchGleif("AB", "");
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accetta come identificativo solo le sequenze numeriche", () => {
    // Il CVR danese e il codice fiscale italiano sono usabili dagli adapter.
    expect(numericRegistryId("61056416")).toBe("61056416");
    expect(numericRegistryId("00484960588")).toBe("00484960588");
    // "HRB 6684" non è un numero che un adapter possa interrogare.
    expect(numericRegistryId("HRB 6684")).toBeUndefined();
    expect(numericRegistryId(undefined)).toBeUndefined();
  });
});
