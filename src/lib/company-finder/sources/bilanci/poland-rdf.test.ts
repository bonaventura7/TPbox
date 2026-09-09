import { describe, expect, it, vi } from "vitest";

import { fetchPolishFinancialDocument, fetchPolishAnnualReport, searchPolishAnnualReports } from "./poland-rdf";

vi.mock("../krs", () => ({
  fetchKrsOdpis: vi.fn().mockResolvedValue({
    ok: true,
    data: { name: "EULEO SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ" },
  }),
}));

vi.mock("./poland-aleo", () => ({
  fetchAleoAnnualReport: vi.fn().mockResolvedValue({
    ok: true,
    bytes: new TextEncoder().encode("%PDF-1.7\nALEO FALLBACK"),
    contentType: "application/pdf",
    filename: "bilancio-2024.pdf",
    document: { id: "https://aleo.com/doc/2024.pdf", year: 2024, title: "Roczne sprawozdanie finansowe", format: "pdf", url: "https://aleo.com/doc/2024.pdf" },
  }),
}));

function response(body: string | Uint8Array, status = 200, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers });
}

describe("Polish KRS RDF financial documents", () => {
  it("discovers the annual report and exposes a downloadable PDF", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(
        response("<html><body>RDF viewer</body></html>", 200, {
          "set-cookie": "XSRF-TOKEN=token123; Path=/; Secure",
        }),
      )
      .mockResolvedValueOnce(
        response(
          JSON.stringify({
            tresc: [
              {
                id: "doc-2024",
                nazwaDokumentu: "Roczne sprawozdanie finansowe",
                rokObrotowy: 2024,
              },
            ],
          }),
          200,
          { "content-type": "application/json" },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const reports = await searchPolishAnnualReports("0000002594", 2024);

    expect(reports.ok).toBe(true);
    expect(reports.documents).toEqual([
      expect.objectContaining({
        id: "doc-2024",
        year: 2024,
        format: "pdf",
      }),
    ]);

    fetchMock.mockResolvedValueOnce(
      response("<html><body>RDF viewer</body></html>", 200, {
        "set-cookie": "XSRF-TOKEN=token123; Path=/; Secure",
      }),
    );
    fetchMock.mockResolvedValueOnce(
      response("%PDF-1.7\nAVIO POLSKA", 200, {
        "content-type": "application/pdf",
      }),
    );

    const document = await fetchPolishFinancialDocument("0000002594", "doc-2024");

    expect(document.ok).toBe(true);
    expect(document.contentType).toContain("application/pdf");
    expect(document.bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder("latin1").decode(document.bytes).startsWith("%PDF-")).toBe(true);
  });

  it("falls back to the RDF root when the public viewer route returns an Incapsula challenge", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          "<html><title>Incapsula incident id</title><body>Request unsuccessful</body></html>",
          200,
          { "content-type": "text/html" },
        ),
      )
      .mockResolvedValueOnce(
        response("<html><body>RDF viewer</body></html>", 200, {
          "set-cookie": "XSRF-TOKEN=token123; Path=/; Secure",
        }),
      )
      .mockResolvedValueOnce(
        response(JSON.stringify({ tresc: [{ id: "doc-2024", nazwaDokumentu: "Roczne sprawozdanie finansowe", rokObrotowy: 2024 }] }), 200, {
          "content-type": "application/json",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const reports = await searchPolishAnnualReports("0000002594", 2024);

    expect(reports.ok).toBe(true);
    expect(reports.documents[0]).toEqual(expect.objectContaining({ id: "doc-2024", year: 2024 }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falls back to a free secondary PDF when official RDF is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("RDF WAF blocked")),
    );

    const document = await fetchPolishAnnualReport("0000961703", 2024, 200);

    expect(document.ok).toBe(true);
    expect(document.contentType).toBe("application/pdf");
    expect(new TextDecoder("latin1").decode(document.bytes).startsWith("%PDF-")).toBe(true);
  });
});
