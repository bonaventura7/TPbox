import { describe, expect, it, vi } from "vitest";

import {
  buildSucheFirmaEnvelope,
  classifyUrkunde,
  fetchAtFirmenbuchBilanci,
  fnFromInput,
  parseFirmen,
  parseUrkunden,
} from "./justizonline-at";

function response(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

const SUCHE_FIRMA_OK = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <SUCHEFIRMARESPONSE xmlns="ns://firmenbuch.justiz.gv.at/Abfrage/SucheFirmaResponse">
      <FIRMA><FNR>123456 a</FNR><FIRMENWORTLAUT>Muster GmbH</FIRMENWORTLAUT><SITZ>Wien</SITZ></FIRMA>
      <FIRMA><FNR>123456 a</FNR><FIRMENWORTLAUT>Muster GmbH</FIRMENWORTLAUT></FIRMA>
      <FIRMA><FNR>654321 b</FNR><FIRMENWORTLAUT>Muster Holding GmbH</FIRMENWORTLAUT><SITZ>Graz</SITZ></FIRMA>
    </SUCHEFIRMARESPONSE>
  </soap:Body>
</soap:Envelope>`;

const SUCHE_URKUNDE_OK = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <SUCHEURKUNDERESPONSE xmlns="ns://firmenbuch.justiz.gv.at/Abfrage/SucheUrkundeResponse">
      <URKUNDE><URKUNDENART>Jahresabschluss 2023</URKUNDENART><EINREICHUNGSDATUM>2024-06-30</EINREICHUNGSDATUM></URKUNDE>
      <URKUNDE><URKUNDENART>Jahresabschluss 2024</URKUNDENART><EINREICHUNGSDATUM>2025-07-01</EINREICHUNGSDATUM></URKUNDE>
      <URKUNDE><URKUNDENART>Satzung</URKUNDENART><DATUM>2010-01-15</DATUM></URKUNDE>
    </SUCHEURKUNDERESPONSE>
  </soap:Body>
</soap:Envelope>`;

const FAULT = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <soap:Fault>
      <soap:Code><soap:Value>soap:Sender</soap:Value></soap:Code>
      <soap:Reason><soap:Text>Ungueltiges FIRMENWORTLAUT</soap:Text></soap:Reason>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

describe("JustizOnline HVD — identificativi", () => {
  it("riconosce la Firmenbuchnummer in vari formati", () => {
    expect(fnFromInput("FN 629 a")).toBe("629 a");
    expect(fnFromInput("fn123456B")).toBe("123456 b");
    expect(fnFromInput("123456b")).toBe("123456 b");
    expect(fnFromInput("ATU12345678")).toBeUndefined();
    expect(fnFromInput("Muster GmbH")).toBeUndefined();
  });
});

describe("JustizOnline HVD — envelope", () => {
  it("escapa la denominazione e cerca in modo tollerante", () => {
    const env = buildSucheFirmaEnvelope('Müller & "Söhne" GmbH');
    expect(env).toContain("Müller &amp; &quot;Söhne&quot; GmbH");
    expect(env).not.toContain('Müller & "Söhne" GmbH');
    expect(env).toContain("<suc:EXAKTESUCHE>false</suc:EXAKTESUCHE>");
  });
});

describe("JustizOnline HVD — parser", () => {
  it("estrae i candidati FIRMA con deduplica per FNR", () => {
    const firms = parseFirmen(SUCHE_FIRMA_OK);
    expect(firms).toHaveLength(2);
    expect(firms[0]).toEqual({ fnr: "123456 a", name: "Muster GmbH", seat: "Wien" });
  });

  it("fa fallback sulle coppie FNR/FIRMENWORTLAUT senza blocchi noti", () => {
    const flat = `<R><FNR>1 a</FNR><FIRMENWORTLAUT>Erste GmbH</FIRMENWORTLAUT><FNR>2 b</FNR><FIRMENWORTLAUT>Zweite GmbH</FIRMENWORTLAUT></R>`;
    expect(parseFirmen(flat).map((f) => f.name)).toEqual(["Erste GmbH", "Zweite GmbH"]);
  });

  it("classifica gli atti per tipo", () => {
    expect(classifyUrkunde("Konzernjahresabschluss")).toBe("ANNUAL_REPORT");
    expect(classifyUrkunde("Eröffnungsbilanz")).toBe("BALANCE_SHEET");
    expect(classifyUrkunde("Prüfungsbericht des Abschlussprüfers")).toBe("AUDIT_REPORT");
    expect(classifyUrkunde("Satzung")).toBe("OTHER");
  });

  it("estrae data ed esercizio dagli atti", () => {
    const docs = parseUrkunden(SUCHE_URKUNDE_OK, "123456 a");
    expect(docs).toHaveLength(3);
    expect(docs[1]).toMatchObject({ kind: "ANNUAL_REPORT", year: 2025, date: "2025-07-01" });
    expect(docs[2]).toMatchObject({ kind: "OTHER" });
  });
});

describe("JustizOnline HVD — fetch orchestrato", () => {
  it("senza chiave dichiara skipped e non chiama la rete", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchAtFirmenbuchBilanci("Muster GmbH", undefined);
    expect(r.ok).toBe(false);
    expect(r.skipped).toContain("AT_JUSTIZONLINE_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con FN diretta interroga solo gli atti", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(SUCHE_URKUNDE_OK));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchAtFirmenbuchBilanci("FN 123456a", "key-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ "X-Api-Key": "key-123" });
    expect(r.ok).toBe(true);
    expect(r.data?.source).toContain("FN 123456 a");
  });

  it("risolve per nome, elenca i bilanci e ordina gli esercizi", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(SUCHE_FIRMA_OK))
      .mockResolvedValueOnce(response(SUCHE_URKUNDE_OK));
    vi.stubGlobal("fetch", fetchMock);

    const r = await fetchAtFirmenbuchBilanci("Muster Holding GmbH", "key-123");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
    expect(r.data?.availability).toBe("DOCUMENT_FOUND");
    // La seconda chiamata usa il FNR del match esatto, non del primo candidato
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain("<suc:FNR>654321 b</suc:FNR>");
    expect(r.data?.years.map((y) => y.year)).toEqual([2025, 2024]);
    expect(r.data?.documents?.every((d) => d.kind === "ANNUAL_REPORT")).toBe(true);
    expect(r.data?.documents?.[0]).toMatchObject({ restriction: "SOURCE_RESTRICTION" });
  });

  it("propaga i SOAP Fault come errore", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(FAULT));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchAtFirmenbuchBilanci("Muster GmbH", "key-123");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Ungueltiges FIRMENWORTLAUT");
  });

  it("401 significa chiave non valida", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response("", 401));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchAtFirmenbuchBilanci("Muster GmbH", "key-123");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("chiave JustizOnline non valida");
  });

  it("nessuna corrispondenza = errore esplicito, mai documenti inventati", async () => {
    const empty = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><SUCHEFIRMARESPONSE><ANZAHL>0</ANZAHL></SUCHEFIRMARESPONSE></soap:Body></soap:Envelope>`;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(empty));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchAtFirmenbuchBilanci("Nonesiste Assurda GmbH", "key-123");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("nessuna società");
  });
});
