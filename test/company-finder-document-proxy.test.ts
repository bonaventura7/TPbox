import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ALLOWED_DOCUMENT_HOSTS,
  handleDocumentRequest,
  isAllowedDocumentHost,
} from "../src/lib/company-finder/document-proxy.server";

/**
 * Il proxy documenti è l'unico punto in cui il server dell'Osservatorio
 * scarica un file da un dominio terzo. La whitelist è quindi una superficie di
 * sicurezza: questi test la difendono senza toccare la rete.
 */
function get(query: string): Request {
  return new Request(`https://osservatorio.example/api/company-finder/document${query}`);
}

describe("proxy dei documenti di bilancio", () => {
  it("accetta solo i registri ufficiali censiti", () => {
    expect(isAllowedDocumentHost(new URL("https://www.unternehmensregister.de/x.pdf"))).toBe(true);
    expect(isAllowedDocumentHost(new URL("https://opendata.kvk.nl/api/v1/kvknummer/1"))).toBe(true);
    // ekrs.ms.gov.pl non è più in whitelist: il repository polacco risponde
    // 403 a qualunque server, quindi il documento non passa dal proxy ma
    // dalla consultazione ufficiale incorporata (vedi coverage.ts).
    expect(isAllowedDocumentHost(new URL("https://ekrs.ms.gov.pl/rdf/pd/x"))).toBe(false);
  });

  it("rifiuta domini non censiti, inclusi i sottodomini somiglianti", async () => {
    expect(isAllowedDocumentHost(new URL("https://evil.example/x.pdf"))).toBe(false);
    expect(
      isAllowedDocumentHost(new URL("https://unternehmensregister.de.evil.example/x.pdf")),
    ).toBe(false);

    const res = await handleDocumentRequest(get("?url=https%3A%2F%2Fevil.example%2Fx.pdf"));
    expect(res.status).toBe(403);
  });

  it("richiede il parametro url", async () => {
    expect((await handleDocumentRequest(get(""))).status).toBe(400);
  });

  it("rifiuta una url non valida", async () => {
    expect((await handleDocumentRequest(get("?url=non-una-url"))).status).toBe(400);
  });

  it("rifiuta http in chiaro sugli host che servono https", async () => {
    const res = await handleDocumentRequest(
      get("?url=http%3A%2F%2Fwww.unternehmensregister.de%2Fx.pdf"),
    );
    expect(res.status).toBe(400);
  });

  it("ammette http solo per regnskaber.virk.dk, che non risponde su TLS", async () => {
    // Non deve fermarsi al controllo di protocollo: qui il rifiuto sarebbe un
    // 400, mentre la chiamata deve proseguire (e fallire in rete, non prima).
    const res = await handleDocumentRequest(
      get("?url=http%3A%2F%2Fregnskaber.virk.dk%2F123%2Fdoc.pdf"),
    );
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(403);
  });

  it("non lascia entrare nella whitelist host generici", () => {
    for (const host of ALLOWED_DOCUMENT_HOSTS) {
      expect(host).toMatch(/\.(de|dk|nl|be|uk|gr|gov\.uk)$/);
    }
  });

  it("censisce i canali greci: portale pubblico, filing iXBRL e API aperta", () => {
    expect(
      isAllowedDocumentHost(
        new URL(
          "https://publicity.businessportal.gr/api/download/financial/2150556?companyId=178892854000",
        ),
      ),
    ).toBe(true);
    expect(
      isAllowedDocumentHost(new URL("https://filings.businessportal.gr/ixbrl/x_ixbrlview.html")),
    ).toBe(true);
    expect(
      isAllowedDocumentHost(
        new URL(
          "https://opendata-api.businessportal.gr/api/opendata/v1/downloadFile?key=assemblyDecision&elementId=1",
        ),
      ),
    ).toBe(true);
    // Il suffisso non basta: l'host deve essere quello vero.
    expect(
      isAllowedDocumentHost(new URL("https://publicity.businessportal.gr.evil.example/x.pdf")),
    ).toBe(false);
  });

  it("scarica con un clic: Content-Disposition attachment e nome file sicuro", async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(pdf, {
            status: 200,
            headers: { "Content-Type": "application/pdf" },
          }),
      ),
    );

    const res = await handleDocumentRequest(
      get(
        `?url=${encodeURIComponent("https://publicity.businessportal.gr/api/download/financial/2150556?companyId=178892854000")}&disposition=attachment&filename=${encodeURIComponent("ΑΡΧΕΙΟ ΟΙΚΟΝ ΚΑΤΑΣΤ 2024.pdf")}`,
      ),
    );

    expect(res.status).toBe(200);
    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition.startsWith("attachment;")).toBe(true);
    expect(disposition).toContain("filename*=UTF-8''");
    // Il nome ascii non contiene caratteri di controllo né ritorni a capo.
    expect(disposition).not.toMatch(/[\r\n]/);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("di default il documento resta inline, per l'apertura in pagina", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
            status: 200,
            headers: { "Content-Type": "application/pdf" },
          }),
      ),
    );
    const res = await handleDocumentRequest(
      get(
        `?url=${encodeURIComponent("https://publicity.businessportal.gr/api/download/financial/1?companyId=1")}`,
      ),
    );
    expect(res.headers.get("Content-Disposition")).toBe("inline");
  });

  it("non serve un file che dichiara di essere un PDF ma non lo è", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new TextEncoder().encode("<html>non sono un pdf</html>"), {
            status: 200,
            headers: { "Content-Type": "application/pdf" },
          }),
      ),
    );
    const res = await handleDocumentRequest(
      get(
        `?url=${encodeURIComponent("https://publicity.businessportal.gr/api/download/financial/1?companyId=1")}`,
      ),
    );
    expect(res.status).toBe(502);
  });

  it("rifiuta una risposta vuota della fonte", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array(0), {
            status: 200,
            headers: { "Content-Type": "application/pdf" },
          }),
      ),
    );
    const res = await handleDocumentRequest(
      get(
        `?url=${encodeURIComponent("https://publicity.businessportal.gr/api/download/financial/1?companyId=1")}`,
      ),
    );
    expect(res.status).toBe(502);
  });

  it("manda la chiave API ΓΕΜΗ solo all'API aperta e non la mostra all'utente", async () => {
    process.env["GEMI_API_KEY"] = "chiave-segreta";
    const seen: Record<string, string>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        seen.push((init?.headers ?? {}) as Record<string, string>);
        return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        });
      }),
    );

    const viaApi = await handleDocumentRequest(
      get(
        `?url=${encodeURIComponent("https://opendata-api.businessportal.gr/api/opendata/v1/downloadFile?key=assemblyDecision&elementId=1")}`,
      ),
    );
    expect(viaApi.status).toBe(200);
    expect(seen[0]?.["api_key"]).toBe("chiave-segreta");
    expect(viaApi.headers.get("api_key")).toBeNull();
    expect(JSON.stringify(await viaApi.clone().text())).not.toContain("chiave-segreta");

    const viaPortal = await handleDocumentRequest(
      get(
        `?url=${encodeURIComponent("https://publicity.businessportal.gr/api/download/financial/1?companyId=1")}`,
      ),
    );
    expect(viaPortal.status).toBe(200);
    expect(seen[1]?.["api_key"]).toBeUndefined();

    delete process.env["GEMI_API_KEY"];
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["GEMI_API_KEY"];
});
