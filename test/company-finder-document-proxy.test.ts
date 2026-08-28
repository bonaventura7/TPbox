import { describe, expect, it } from "vitest";

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
    expect(isAllowedDocumentHost(new URL("https://ekrs.ms.gov.pl/rdf/pd/x"))).toBe(true);
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
      expect(host).toMatch(/\.(de|dk|nl|pl|be)$/);
    }
  });
});
