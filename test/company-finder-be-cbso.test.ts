import { afterEach, describe, expect, it, vi } from "vitest";

import { cbeFromInput, fetchCbsoAccounts } from "../src/lib/company-finder/sources/bilanci/cbso-be";
import { handleDocumentRequest } from "../src/lib/company-finder/document-proxy.server";

/**
 * Belgio — NBB Central Balance Sheet Office.
 * La chiave gratuita la crea una persona sul developer portal NBB (serve una
 * casella email per l'attivazione); qui si verifica tutto il resto della
 * catena: risoluzione dei riferimenti, URL del documento già proxato con
 * accept=pdf e iniezione lato server della chiave nel proxy.
 */

const CBE = "0442824497";
const KEY = "test-primary-key";

const REFERENCES = {
  legalEntity: CBE,
  references: [
    { depositReference: "2023-00123456", periodEnd: "2023-12-31" },
    { depositReference: "2024-00078901", periodEnd: "2024-12-31" },
  ],
};

function mockJson(payload: unknown, status = 200) {
  return vi.fn(
    async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
      }) as unknown as Response,
  );
}

function get(query: string): Request {
  return new Request(`https://tpbox.example/api/company-finder/document${query}`);
}

const ENV_KEY = "NBB_CBSO_API_KEY";
let savedKey: string | undefined;

function setServerKey(value: string | undefined): void {
  if (value === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = value;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setServerKey(savedKey);
  savedKey = undefined;
});

describe("Belgio — CBE e chiamata /references", () => {
  it("accetta solo il CBE a 10 cifre", () => {
    expect(cbeFromInput(CBE)).toBe(CBE);
    expect(cbeFromInput("0442 824 497")).toBe("0442824497");
    expect(cbeFromInput("BE0442824497")).toBeUndefined();
    expect(cbeFromInput("123")).toBeUndefined();
  });

  it("senza chiave dichiara lo skipped invece di chiamare il gateway", async () => {
    const fetchMock = mockJson(REFERENCES);
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchCbsoAccounts(CBE, undefined);
    expect(r.ok).toBe(false);
    expect(r.skipped).toMatch(/NBB-CBSO/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rifiuta il CBE malformato prima della rete", async () => {
    const r = await fetchCbsoAccounts("123", KEY);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/CBE non valido/);
  });

  it("chiama /references con chiave e X-Request-Id e serve l'ultimo deposito", async () => {
    const fetchMock = mockJson(REFERENCES);
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchCbsoAccounts(CBE, KEY);
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://ws.cbso.nbb.be/authentic/legalEntity/${CBE}/references`);
    const headers = init.headers as Record<string, string>;
    expect(headers["NBB-CBSO-Subscription-Key"]).toBe(KEY);
    expect(headers["X-Request-Id"]).toMatch(/^tpbox-/);
    expect(r.data?.documentTitle).toContain("2024-00078901");
    expect(r.data?.source).toMatch(/NBB Central Balance Sheet Office/);
    expect(r.data?.documentUrl).toMatch(/^\/api\/company-finder\/document\?url=/);
    expect(r.data?.documentUrl).toContain("accept=application%2Fpdf");
    expect(r.data?.documentUrl).toContain(
      encodeURIComponent("https://ws.cbso.nbb.be/authentic/deposit/2024-00078901/accountingData"),
    );
    expect(r.data?.documentUrl).not.toContain(KEY);
  });

  it("onora la base di test UAT2 quando configurata", async () => {
    const fetchMock = mockJson(REFERENCES);
    vi.stubGlobal("fetch", fetchMock);
    await fetchCbsoAccounts(CBE, KEY, "https://ws.uat2.cbso.nbb.be/");
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://ws.uat2.cbso.nbb.be/authentic/legalEntity/${CBE}/references`);
  });

  it("401/403 → errore azionabile sulla chiave", async () => {
    for (const status of [401, 403]) {
      vi.stubGlobal("fetch", mockJson({ message: "denied" }, status));
      const r = await fetchCbsoAccounts(CBE, "chiave-sbagliata");
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/chiave non valida|Authentic Data Query/);
    }
  });

  it("404 o riferimenti vuoti → nessun conto pubblicato", async () => {
    vi.stubGlobal("fetch", mockJson({}, 404));
    const notFound = await fetchCbsoAccounts(CBE, KEY);
    expect(notFound.error).toMatch(/nessun conto annuale/);

    vi.stubGlobal("fetch", mockJson({ references: [] }));
    const empty = await fetchCbsoAccounts(CBE, KEY);
    expect(empty.error).toMatch(/nessun conto annuale/);
  });
});

describe("Belgio — il proxy inietta la chiave solo lato server", () => {
  const pdfBytes = new TextEncoder().encode("%PDF-1.4 conti annuali").buffer as ArrayBuffer;
  const CBSO_PDF = "https://ws.cbso.nbb.be/authentic/deposit/2024-00078901/accountingData";

  it("senza NBB_CBSO_API_KEY risponde 503 con messaggio azionabile", async () => {
    savedKey = process.env[ENV_KEY];
    setServerKey(undefined);
    const res = await handleDocumentRequest(
      get(`?url=${encodeURIComponent(CBSO_PDF)}&accept=${encodeURIComponent("application/pdf")}`),
    );
    expect(res.status).toBe(503);
    expect(await res.text()).toMatch(/NBB_CBSO_API_KEY/);
  });

  it("con chiave configurata la inoltra al gateway e serve il PDF", async () => {
    savedKey = process.env[ENV_KEY];
    setServerKey(KEY);
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/pdf" }),
          arrayBuffer: async () => pdfBytes.slice(0),
        }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleDocumentRequest(
      get(`?url=${encodeURIComponent(CBSO_PDF)}&accept=${encodeURIComponent("application/pdf")}`),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["NBB-CBSO-Subscription-Key"]).toBe(KEY);
    expect(headers["X-Request-Id"]).toMatch(/^tpbox-/);
    expect(headers.Accept).toBe("application/pdf");
    const body = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(body)).not.toContain(KEY);
    expect(JSON.stringify([...res.headers.entries()])).not.toContain(KEY);
  });

  it("applica la stessa iniezione all'host di test UAT2", async () => {
    savedKey = process.env[ENV_KEY];
    setServerKey(KEY);
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/pdf" }),
          arrayBuffer: async () => pdfBytes.slice(0),
        }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleDocumentRequest(
      get(
        `?url=${encodeURIComponent("https://ws.uat2.cbso.nbb.be/authentic/deposit/2021-00000132/accountingData")}`,
      ),
    );
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["NBB-CBSO-Subscription-Key"]).toBe(KEY);
  });
});
