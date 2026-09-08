import { afterEach, describe, expect, it, vi } from "vitest";

import {
  brregAnnualReportUrl,
  brregInternalDocumentUrl,
  brregOrgFromInput,
  fetchBrregAnnualReportDocument,
  fetchBrregAnnualReports,
  isBrregPdf,
  parseBrregAnnualYears,
} from "./brreg-no";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Norway — identifiers and URLs", () => {
  it("accepts only a 9-digit org.nr", () => {
    expect(brregOrgFromInput("123456789")).toBe("123456789");
    expect(brregOrgFromInput("NO 123 456 789")).toBe("123456789");
    expect(brregOrgFromInput("12345678")).toBeUndefined();
    expect(brregOrgFromInput("NO1234567890")).toBeUndefined();
  });

  it("builds official and internal document URLs", () => {
    expect(brregAnnualReportUrl("123456789", 2024)).toBe(
      "https://data.brreg.no/regnskapsregisteret/regnskap/aarsregnskap/kopi/123456789/2024",
    );
    expect(brregInternalDocumentUrl("123456789", 2024, false)).toBe(
      "/api/company-finder/document?country=NO&company=123456789&year=2024",
    );
    expect(brregInternalDocumentUrl("123456789", 2024, true)).toContain("&download=1");
  });
});

describe("Norway — annual report years", () => {
  it("normalizes supported API response shapes, removes duplicates and sorts newest first", () => {
    expect(parseBrregAnnualYears({ aar: [2023, "2025", 2024, 2025] })).toEqual([2025, 2024, 2023]);
    expect(parseBrregAnnualYears([2022, "2024", { aar: 2023 }, { year: "2025" }])).toEqual([
      2025, 2024, 2023, 2022,
    ]);
    expect(parseBrregAnnualYears({ years: [{ regnskapsaar: 2024 }, { regnskapsår: "2023" }] })).toEqual([
      2024, 2023,
    ]);
  });
});

describe("Norway — financial provider", () => {
  it("returns downloadable annual reports from the year-list endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ aar: [2025, 2024, 2023] })),
    );

    const result = await fetchBrregAnnualReports("123456789");
    expect(result.ok).toBe(true);
    expect(result.data?.available).toBe(true);
    expect(result.data?.currency).toBe("NOK");
    expect(result.data?.years.map((y) => y.year)).toEqual([2025, 2024, 2023]);
    expect(result.data?.documents?.[0]).toMatchObject({
      id: "NO-123456789-2025",
      year: 2025,
      kind: "ANNUAL_REPORT",
      format: "pdf",
      availability: "DOCUMENT_DOWNLOADABLE",
      downloadUrl:
        "/api/company-finder/document?country=NO&company=123456789&year=2025&download=1",
    });
  });

  it("fails closed on malformed org.nr without calling the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await fetchBrregAnnualReports("12345678");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("9 cifre");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats a 404 year list as a valid no-reports result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
    const result = await fetchBrregAnnualReports("123456789");
    expect(result.ok).toBe(true);
    expect(result.data?.available).toBe(false);
    expect(result.data?.documents).toEqual([]);
  });

  it("accepts only real PDF bytes for a report document", async () => {
    const pdf = new Uint8Array([...new TextEncoder().encode("%PDF-1.7\n"), 1, 2, 3]).buffer;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(pdf, { status: 200 })));
    const result = await fetchBrregAnnualReportDocument("123456789", 2024);
    expect(result.ok).toBe(true);
    expect(result.bytes).toBeInstanceOf(ArrayBuffer);
    expect(isBrregPdf(result.bytes!)).toBe(true);
  });

  it("rejects a non-PDF document body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>error</html>", { status: 200 })));
    const result = await fetchBrregAnnualReportDocument("123456789", 2024);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("PDF");
  });
});
