import { describe, expect, it, vi } from "vitest";

import { fetchAleoAnnualReport } from "./poland-aleo";

describe("ALEO Polish annual-report fallback", () => {
  it("uses the direct ALEO page before the reader proxy and accepts PDF download endpoints", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          '<html><a href="https://aleo.com/download?id=pdf-2024">Roczne sprawozdanie finansowe 2024 PDF</a></html>',
          { status: 200, headers: { "content-type": "text/html" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response("%PDF-1.7\nALEO", { status: 200, headers: { "content-type": "application/pdf" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAleoAnnualReport("EULEO SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ", 2024, 500);

    expect(result.ok).toBe(true);
    expect(result.contentType).toBe("application/pdf");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("https://aleo.com/pl/firma/");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("r.jina.ai");
  });
});
