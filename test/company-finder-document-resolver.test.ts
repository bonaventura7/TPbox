import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  detectFormat,
  handleFinancialDocumentRequest,
  isAllowedSource,
  issueDocumentToken,
  resetResolverState,
  sha256Hex,
  validateDocument,
} from "../src/lib/company-finder/document-resolver.server";

const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\n1 0 obj\nfake pdf body\n%%EOF").buffer;

function pdfResponse(): Response {
  return new Response(PDF_BYTES, { status: 200, headers: { "Content-Type": "application/pdf" } });
}

function request(token: string): Request {
  return new Request(`https://tp-box.test/api/company-finder/financial-document?token=${token}`);
}

beforeEach(() => {
  resetResolverState();
});

describe("allowlist esatta e protezione SSRF", () => {
  it("accetta solo gli host esatti dell'allowlist, su https", () => {
    expect(isAllowedSource(new URL("https://regnskaber.virk.dk/x"))).toBe(true);
    expect(isAllowedSource(new URL("https://evil.regnskaber.virk.dk/x"))).toBe(false);
    expect(isAllowedSource(new URL("https://attacker.example/x"))).toBe(false);
    expect(isAllowedSource(new URL("https://127.0.0.1/x"))).toBe(false);
    expect(isAllowedSource(new URL("https://169.254.169.254/latest/meta-data"))).toBe(false);
    expect(isAllowedSource(new URL("https://[::1]/x"))).toBe(false);
  });

  it("rifiuta un token verso un host fuori allowlist", async () => {
    const token = issueDocumentToken({ url: "https://attacker.example/doc.pdf", registry: "x" });
    const response = await handleFinancialDocumentRequest(request(token), {
      fetchImpl: vi.fn(async () => pdfResponse()) as unknown as typeof fetch,
    });
    expect(response.status).toBe(403);
  });

  it("rifiuta http:// anche su host in allowlist", async () => {
    const token = issueDocumentToken({ url: "http://opendata.kvk.nl/doc.pdf", registry: "KVK" });
    const response = await handleFinancialDocumentRequest(request(token), {
      fetchImpl: vi.fn(async () => pdfResponse()) as unknown as typeof fetch,
    });
    expect(response.status).toBe(403);
  });

  it("non segue un redirect verso un host fuori allowlist", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, { status: 302, headers: { Location: "https://attacker.example/doc.pdf" } }),
    );
    const token = issueDocumentToken({ url: "https://opendata.kvk.nl/doc.pdf", registry: "KVK" });
    const response = await handleFinancialDocumentRequest(request(token), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(response.status).toBe(403);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("validazione del documento", () => {
  it("riconosce i formati dai magic bytes", () => {
    expect(detectFormat(new Uint8Array(new TextEncoder().encode("%PDF-1.4")))).toBe("pdf");
    expect(detectFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe("zip");
    expect(detectFormat(new Uint8Array(new TextEncoder().encode("<?xml version")))).toBe("xml");
    expect(detectFormat(new Uint8Array(new TextEncoder().encode("boh")))).toBe("unknown");
  });

  it("rifiuta un content-type pdf con corpo non pdf", () => {
    const bytes = new TextEncoder().encode("<html>errore</html>").buffer;
    const outcome = validateDocument({ status: 200, contentType: "application/pdf", bytes });
    expect(outcome.ok).toBe(false);
  });

  it("rifiuta un documento oltre la soglia di dimensione", () => {
    const big = new ArrayBuffer(31 * 1024 * 1024);
    new Uint8Array(big).set(new TextEncoder().encode("%PDF-1.7"));
    const outcome = validateDocument({ status: 200, contentType: "application/pdf", bytes: big });
    expect(outcome.ok).toBe(false);
  });

  it("calcola lo SHA-256 del documento servito e lo espone come header", async () => {
    const expected = await sha256Hex(PDF_BYTES);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
    const token = issueDocumentToken({ url: "https://opendata.kvk.nl/doc.pdf", registry: "KVK" });
    const response = await handleFinancialDocumentRequest(request(token), {
      fetchImpl: vi.fn(async () => pdfResponse()) as unknown as typeof fetch,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Document-Sha256")).toBe(expected);
    expect(response.headers.get("Content-Type")).toContain("application/pdf");
  });

  it("un content-type non pdf con corpo html non viene servito come documento", async () => {
    const token = issueDocumentToken({ url: "https://opendata.kvk.nl/doc.pdf", registry: "KVK" });
    const response = await handleFinancialDocumentRequest(request(token), {
      fetchImpl: vi.fn(
        async () =>
          new Response("<html>captcha</html>", {
            status: 200,
            headers: { "Content-Type": "application/pdf" },
          }),
      ) as unknown as typeof fetch,
    });
    expect(response.status).toBe(502);
  });
});

describe("token opaco: nessun dato del registro verso il client", () => {
  it("un token inesistente risponde 404 e non rivela nulla", async () => {
    const response = await handleFinancialDocumentRequest(request("inesistente"), {
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toMatch(/https?:\/\//);
  });

  it("la risposta di errore non contiene mai l'URL della fonte", async () => {
    const token = issueDocumentToken({ url: "https://opendata.kvk.nl/segreto.pdf", registry: "KVK" });
    const response = await handleFinancialDocumentRequest(request(token), {
      fetchImpl: vi.fn(async () => new Response("nope", { status: 404 })) as unknown as typeof fetch,
    });
    const body = await response.text();
    expect(body).not.toContain("segreto.pdf");
    expect(body).not.toContain("opendata.kvk.nl");
  });
});

describe("resilienza: retry, backoff, circuit breaker", () => {
  it("riprova al massimo 3 volte sugli errori idempotenti", async () => {
    const fetchImpl = vi.fn(async () => new Response("busy", { status: 503 }));
    const token = issueDocumentToken({ url: "https://opendata.kvk.nl/doc.pdf", registry: "KVK" });
    const response = await handleFinancialDocumentRequest(request(token), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(response.status).toBe(502);
  });

  it("non riprova su un 404 della fonte", async () => {
    const fetchImpl = vi.fn(async () => new Response("missing", { status: 404 }));
    const token = issueDocumentToken({ url: "https://opendata.kvk.nl/doc.pdf", registry: "KVK" });
    await handleFinancialDocumentRequest(request(token), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("il backoff è esponenziale con jitter e cresce a ogni tentativo", async () => {
    const delays: number[] = [];
    const fetchImpl = vi.fn(async () => new Response("busy", { status: 503 }));
    const token = issueDocumentToken({ url: "https://opendata.kvk.nl/doc.pdf", registry: "KVK" });
    await handleFinancialDocumentRequest(request(token), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async (ms: number) => {
        delays.push(ms);
      },
    });
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBeGreaterThan(0);
    expect(delays[1]!).toBeGreaterThan(delays[0]!);
  });

  it("apre il circuito dopo ripetuti fallimenti dello stesso host", async () => {
    const fetchImpl = vi.fn(async () => new Response("busy", { status: 503 }));
    const deps = { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} };
    for (let i = 0; i < 2; i += 1) {
      const token = issueDocumentToken({ url: "https://opendata.kvk.nl/doc.pdf", registry: "KVK" });
      await handleFinancialDocumentRequest(request(token), deps);
    }
    const callsBefore = fetchImpl.mock.calls.length;
    const token = issueDocumentToken({ url: "https://opendata.kvk.nl/doc.pdf", registry: "KVK" });
    const response = await handleFinancialDocumentRequest(request(token), deps);
    expect(response.status).toBe(503);
    expect(fetchImpl.mock.calls.length).toBe(callsBefore);
  });
});
