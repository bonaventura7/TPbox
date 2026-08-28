import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cvrFromVat,
  fetchDkRegnskaber,
} from "../src/lib/company-finder/sources/bilanci/regnskaber-dk";

/** Risposta reale di distribution.virk.dk, ridotta a due pubblicazioni. */
const VIRK_RESPONSE = {
  hits: {
    total: 31,
    hits: [
      {
        _source: {
          cvrNummer: 58495913,
          offentliggoerelsestype: "regnskab",
          offentliggoerelsesTidspunkt: "2026-04-17T13:10:53.534Z",
          regnskab: { regnskabsperiode: { startDato: "2025-01-01", slutDato: "2025-12-31" } },
          dokumenter: [
            {
              dokumentUrl: "http://regnskaber.virk.dk/31959485/aaa.xml",
              dokumentMimeType: "application/xml",
              dokumentType: "AARSRAPPORT",
            },
            {
              dokumentUrl: "http://regnskaber.virk.dk/31959485/bbb.xhtml",
              dokumentMimeType: "application/xhtml+xml",
              dokumentType: "AARSRAPPORT",
            },
          ],
        },
      },
      {
        _source: {
          cvrNummer: 58495913,
          offentliggoerelsestype: "regnskab",
          offentliggoerelsesTidspunkt: "2025-04-25T13:31:00.573Z",
          regnskab: { regnskabsperiode: { startDato: "2024-01-01", slutDato: "2024-12-31" } },
          dokumenter: [
            {
              dokumentUrl: "http://regnskaber.virk.dk/31959485/ccc.pdf",
              dokumentMimeType: "application/pdf",
              dokumentType: "AARSRAPPORT",
            },
          ],
        },
      },
    ],
  },
};

function mockFetch(payload: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({ ok, status, json: async () => payload }) as unknown as Response);
}

afterEach(() => vi.unstubAllGlobals());

describe("bilanci danesi — indice aperto di Erhvervsstyrelsen", () => {
  it("ricava il CVR dalle sole 8 cifre e dall'IVA danese", () => {
    expect(cvrFromVat("58495913")).toBe("58495913");
    expect(cvrFromVat("DK58495913")).toBe("58495913");
    expect(cvrFromVat("1234")).toBeUndefined();
  });

  it("serve l'esercizio più recente e dichiara gli altri", async () => {
    vi.stubGlobal("fetch", mockFetch(VIRK_RESPONSE));
    const r = await fetchDkRegnskaber("58495913");
    expect(r.ok).toBe(true);
    expect(r.data?.available).toBe(true);
    expect(r.data?.documentTitle).toBe("Årsrapport · Esercizio 2025");
    // l'esercizio 2025 non ha PDF: si ripiega sull'XHTML, non sull'XML
    expect(r.data?.documentUrl).toContain(
      encodeURIComponent("http://regnskaber.virk.dk/31959485/bbb.xhtml"),
    );
    expect(r.data?.documentUrl?.startsWith("/api/company-finder/document?url=")).toBe(true);
    expect(r.data?.note).toContain("Esercizio 2024");
  });

  it("non richiede alcuna chiave API", async () => {
    const fetchMock = mockFetch(VIRK_RESPONSE);
    vi.stubGlobal("fetch", fetchMock);
    await fetchDkRegnskaber("58495913");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.stringify(init.headers)).not.toMatch(/key|token|authorization/i);
  });

  it("dichiara l'assenza di depositi invece di inventarli", async () => {
    vi.stubGlobal("fetch", mockFetch({ hits: { total: 0, hits: [] } }));
    const r = await fetchDkRegnskaber("10000000");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("nessun bilancio depositato");
  });
});
