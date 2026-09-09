import { describe, expect, it, vi } from "vitest";

import { fetchSkZavierky, skIdentifierFromInput } from "./registeruz-sk";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Router per URL: abbina il prefisso al path dell'API RÚZ. */
function stubRuz(map: Record<string, Response>) {
  return vi.fn<typeof fetch>((input: RequestInfo | URL) => {
    const url = String(input);
    for (const [prefix, res] of Object.entries(map)) {
      if (url.startsWith(prefix)) return Promise.resolve(res);
    }
    return Promise.resolve(jsonResponse({}, 404));
  });
}

const LIST = "https://www.registeruz.sk/cruz-public/api/uctovne-jednotky";
const JEDNOTKA = "https://www.registeruz.sk/cruz-public/api/uctovna-jednotka";
const ZAVIERKA = "https://www.registeruz.sk/cruz-public/api/uctovna-zavierka";

const CHAIN: Record<string, Response> = {
  [LIST]: jsonResponse({ id: [460474], existujeDalsieId: false }),
  [JEDNOTKA]: jsonResponse({
    id: 460474,
    idUctovnychZavierok: [1001, 1002, 1003],
    ico: "36199222",
    dic: "2020052837",
    nazovUJ: "U. S. Steel Košice, s.r.o.",
  }),
  [`${ZAVIERKA}?id=1001`]: jsonResponse({
    id: 1001,
    obdobieOd: "2024-01",
    obdobieDo: "2024-12",
    typ: "Riadna",
    idUctovnychVykazov: [9001, 9002],
  }),
  [`${ZAVIERKA}?id=1002`]: jsonResponse({
    id: 1002,
    obdobieOd: "2025-01",
    obdobieDo: "2025-12",
    typ: "Riadna",
    idUctovnychVykazov: [9003],
  }),
  [`${ZAVIERKA}?id=1003`]: jsonResponse({
    id: 1003,
    obdobieOd: "2023-01",
    obdobieDo: "2023-12",
    typ: "Mimoriadna",
    idUctovnychVykazov: [9004],
  }),
};

describe("RÚZ — identificativi", () => {
  it("8 cifre = IČO, 10 cifre = DIČ", () => {
    expect(skIdentifierFromInput("36199222")).toEqual({ kind: "ico", value: "36199222" });
    expect(skIdentifierFromInput("2020052837")).toEqual({ kind: "dic", value: "2020052837" });
    expect(skIdentifierFromInput("2020 052 837")).toEqual({ kind: "dic", value: "2020052837" });
    expect(skIdentifierFromInput("36199222x")).toBeUndefined();
    expect(skIdentifierFromInput("123")).toBeUndefined();
  });
});

describe("RÚZ — catena verificata", () => {
  it("entità → závierky ordinate → PDF scaricabili in pagina", async () => {
    const fetchMock = stubRuz(CHAIN);
    vi.stubGlobal("fetch", fetchMock);

    const r = await fetchSkZavierky({ kind: "ico", value: "36199222" });

    expect(r.ok).toBe(true);
    // lista + dettaglio entità + 3 dettagli závierka
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(r.data?.years.map((y) => y.year)).toEqual([2025, 2024, 2023]);
    expect(r.data?.availability).toBe("DOCUMENT_DOWNLOADABLE");
    // Il documento più recente è esposto a livello radice e servito dal proxy
    expect(r.data?.documentUrl).toContain("/api/company-finder/document?url=");
    expect(decodeURIComponent(r.data?.documentUrl ?? "")).toContain(
      "registeruz.sk/cruz-public/domain/financialreport/pdf/9003",
    );
    expect(r.data?.documentTitle).toContain("Esercizio 2025");
    expect(r.data?.documents).toHaveLength(3);
    expect(r.data?.documents?.[0]).toMatchObject({
      kind: "ANNUAL_REPORT",
      format: "pdf",
      availability: "DOCUMENT_DOWNLOADABLE",
      year: 2025,
    });
    expect(r.data?.source).toContain("U. S. Steel Košice");
    expect(r.data?.note).toContain("3 závierky");
  });

  it("usa il parametro dic quando servito", async () => {
    const fetchMock = stubRuz(CHAIN);
    vi.stubGlobal("fetch", fetchMock);
    await fetchSkZavierky({ kind: "dic", value: "2020052837" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("dic=2020052837");
  });

  it("identificativo assente nel registro = errore esplicito", async () => {
    vi.stubGlobal("fetch", stubRuz({ [LIST]: jsonResponse({ id: [], existujeDalsieId: false }) }));
    const r = await fetchSkZavierky({ kind: "ico", value: "00000001" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("nessuna účtovná jednotka");
  });

  it("entità senza závierky pubbliche = errore esplicito", async () => {
    vi.stubGlobal(
      "fetch",
      stubRuz({
        [LIST]: jsonResponse({ id: [1], existujeDalsieId: false }),
        [JEDNOTKA]: jsonResponse({ id: 1, nazovUJ: "Senzazavierky s.r.o." }),
      }),
    );
    const r = await fetchSkZavierky({ kind: "ico", value: "36199222" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("nessuna účtovná závierka");
  });

  it("HTTP non 2xx = errore di trasporto dichiarato", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse({}, 500))),
    );
    const r = await fetchSkZavierky({ kind: "ico", value: "36199222" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("RÚZ HTTP 500");
  });
});
