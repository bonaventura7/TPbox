import { afterEach, describe, expect, it, vi } from "vitest";

import { resolvePolishKrsByName } from "../src/lib/company-finder.functions";
import { gleifPrefixRelevance, searchGleif } from "../src/lib/company-finder/sources/gleif";

afterEach(() => vi.unstubAllGlobals());

// Fixture costruite sulle risposte REALI dell'API pubblica GLEIF (verificate
// live): la forma di `fuzzycompletions` (value + relationships.lei-records.data.id)
// e la forma del singolo `lei-records` (registeredAs / registeredAt / country).
const LEI_RECORDS: Record<
  string,
  { name: string; country: string; registeredAs?: string; registeredAt?: string }
> = {
  "254900URDZ5OLJXP9W37": {
    name: "AVIK POLYCHEM SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
    country: "PL",
    registeredAs: "0000222333",
    registeredAt: "RA000484",
  },
  "335800ZSLKFEFWF2E157": {
    name: "AVI POLYMERS LIMITED",
    country: "GB",
    registeredAs: "12345678",
    registeredAt: "RA000001",
  },
  "549300IRKY0080E7E731": {
    name: '"AVIO POLSKA" SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
    country: "PL",
    registeredAs: "0000002594",
    registeredAt: "RA000484",
  },
  "259400EE5B4VAFD4HY51": {
    name: "MASPEX HOLDING SPÓŁKA AKCYJNA",
    country: "PL",
    registeredAs: "0000725647",
    registeredAt: "RA000484",
  },
};

function fuzzyResponse(items: { value: string; lei: string }[]) {
  return {
    data: items.map((item) => ({
      type: "fuzzycompletions",
      attributes: { value: item.value },
      relationships: {
        "lei-records": {
          data: { type: "lei-records", id: item.lei },
          links: { related: `https://api.gleif.org/api/v1/lei-records/${item.lei}` },
        },
      },
    })),
  };
}

function leiRecordResponse(lei: string) {
  const rec = LEI_RECORDS[lei];
  return {
    data: {
      type: "lei-records",
      id: lei,
      attributes: {
        lei,
        entity: {
          legalName: { name: rec.name },
          legalAddress: { country: rec.country },
          registeredAs: rec.registeredAs,
          registeredAt: { id: rec.registeredAt },
          status: "ACTIVE",
        },
      },
    },
  };
}

function stubGleifFetch(fuzzyMap: Record<string, { value: string; lei: string }[]>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("fuzzycompletions")) {
      const q = new URL(url).searchParams.get("q") ?? "";
      return {
        ok: true,
        status: 200,
        json: async () => fuzzyResponse(fuzzyMap[q] ?? []),
      } as unknown as Response;
    }
    const single = url.match(/\/lei-records\/([^/?]+)$/);
    if (single) {
      return {
        ok: true,
        status: 200,
        json: async () => leiRecordResponse(single[1]!),
      } as unknown as Response;
    }
    // Filtro esatto senza risultati: forza il ripiego fuzzy.
    return { ok: true, status: 200, json: async () => ({ data: [] }) } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("GLEIF — ripiego fuzzy per nomi incompleti", () => {
  it('risolve "AVIO POL" nel LEI corretto scartando omonimie fuzzy e paesi diversi', async () => {
    stubGleifFetch({
      "AVIO POL": [
        { value: "AVIK POLYCHEM", lei: "254900URDZ5OLJXP9W37" },
        { value: "AVI POLYMERS LIMITED", lei: "335800ZSLKFEFWF2E157" },
        {
          value: '"AVIO POLSKA" SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
          lei: "549300IRKY0080E7E731",
        },
      ],
    });

    const result = await searchGleif("AVIO POL", "PL");
    expect(result.ok).toBe(true);
    expect(result.matches[0]?.lei).toBe("549300IRKY0080E7E731");
    expect(result.matches[0]?.registeredAs).toBe("0000002594");
  });

  it('risolve "MASPEX HOLD" nel KRS ufficiale via fuzzycompletions', async () => {
    stubGleifFetch({
      "MASPEX HOLD": [{ value: "MASPEX HOLDING SPÓŁKA AKCYJNA", lei: "259400EE5B4VAFD4HY51" }],
    });

    const result = await resolvePolishKrsByName("MASPEX HOLD");
    expect(result.krs).toBe("0000725647");
    expect(result.detail).toContain("RA000484");
  });

  it('risolve "AVIO POL" nel KRS senza farsi ingannare da AVIK POLYCHEM', async () => {
    stubGleifFetch({
      "AVIO POL": [
        { value: "AVIK POLYCHEM", lei: "254900URDZ5OLJXP9W37" },
        { value: "AVI POLYMERS LIMITED", lei: "335800ZSLKFEFWF2E157" },
        {
          value: '"AVIO POLSKA" SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
          lei: "549300IRKY0080E7E731",
        },
      ],
    });

    const result = await resolvePolishKrsByName("AVIO POL");
    expect(result.krs).toBe("0000002594");
  });

  it("premia il prefisso token e non il semplice overlap", () => {
    expect(
      gleifPrefixRelevance("AVIO POL", '"AVIO POLSKA" SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ'),
    ).toBeGreaterThan(gleifPrefixRelevance("AVIO POL", "AVIK POLYCHEM"));
  });
});
