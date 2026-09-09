import { describe, expect, it, vi } from "vitest";

import { cuiFromInput, fetchRoBilanta, mapBilantYear } from "./anaf-ro";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Router minimale: dispone in base al parametro `an` dell'URL ANAF. */
function stubBilant(map: Record<number, Response>) {
  return vi.fn<typeof fetch>((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const an = Number(url.searchParams.get("an"));
    const res = map[an];
    return Promise.resolve(res ?? jsonResponse({}, 404));
  });
}

const year = (an: number, overrides: Record<string, number> = {}) => ({
  an,
  cui: 1590082,
  deni: "OMV PETROM SA",
  caen: 610,
  den_caen: "Extractia petrolului brut",
  i: Object.entries({
    I1: 33_155_377_909,
    I2: 22_485_842_279,
    I10: 37_930_402_732,
    I13: 33_828_196_866,
    I16: 7_611_446_703,
    I17: 0,
    I18: 3_944_059_894,
    I19: 0,
    I20: 7228,
    ...overrides,
  }).map(([indicator, val_indicator]) => ({
    indicator,
    val_indicator,
    val_den_indicator: "",
  })),
});

describe("ANAF bilanț — identificativi", () => {
  it("accetta solo CUI numerici", () => {
    expect(cuiFromInput("1590082")).toBe("1590082");
    expect(cuiFromInput("001590082")).toBe("1590082");
    expect(cuiFromInput("RO1590082")).toBeUndefined();
    expect(cuiFromInput("abc")).toBeUndefined();
  });
});

describe("ANAF bilanț — mappatura indicatori", () => {
  it("mappa utile/perdita con segno e attivo sommato", () => {
    const profit = mapBilantYear({
      an: 2024,
      indicators: new Map([
        ["I1", 100],
        ["I2", 50],
        ["I13", 1000],
        ["I18", 200],
        ["I19", 0],
      ]),
    });
    expect(profit).toMatchObject({ revenue: 1000, netIncome: 200, totalAssets: 150 });

    const loss = mapBilantYear({
      an: 2023,
      indicators: new Map([
        ["I18", 0],
        ["I19", 420],
        ["I17", 900],
      ]),
    });
    expect(loss.netIncome).toBe(-420);
    expect(loss.operatingProfit).toBe(-900);
  });
});

describe("ANAF bilanț — fetch orchestrato", () => {
  it("salta gli anni non pubblicati e ordina gli esercizi", async () => {
    const current = new Date().getFullYear();
    vi.stubGlobal(
      "fetch",
      stubBilant({
        [current - 1]: jsonResponse({}, 404),
        [current - 2]: jsonResponse(year(current - 2)),
        [current - 3]: jsonResponse(year(current - 3, { I18: 0, I19: 420, I16: 0, I17: 900 })),
      }),
    );

    const r = await fetchRoBilanta("1590082");

    expect(r.ok).toBe(true);
    expect(r.data?.years.map((y) => y.year)).toEqual([current - 2, current - 3]);
    expect(r.data?.years[0]).toMatchObject({
      revenue: 33_828_196_866,
      netIncome: 3_944_059_894,
      totalAssets: 55_641_220_188,
      equity: 37_930_402_732,
      currency: "RON",
    });
    expect(r.data?.years[1]?.netIncome).toBe(-420);
    expect(r.data?.source).toContain("CUI 1590082");
    expect(r.data?.note).toContain("OMV PETROM");
  });

  it("400 = CUI non valido, errore immediato", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse({}, 400))),
    );
    const r = await fetchRoBilanta("1590082");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("non valido");
  });

  it("429 = rate limit dichiarato, niente dati inventati", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse({}, 429))),
    );
    const r = await fetchRoBilanta("1590082");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("rate limit");
  });

  it("senza anni pubblici dichiara l'assenza", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse({}, 404))),
    );
    const r = await fetchRoBilanta("1590082");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("nessun bilanț");
  });
});
