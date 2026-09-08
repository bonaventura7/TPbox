import { describe, expect, it } from "vitest";

import {
  luxembourgCompanyUrl,
  luxembourgRcsFromInput,
  parseLuxembourgPappersIndex,
  toInternalLuxembourgDocuments,
} from "../src/lib/company-finder/sources/bilanci/rcsl-lu";

const INDEX = `<!doctype html><html><body>
<a href="https://gd.lu/rcsl/8hxWqS">Comptes sociaux 2025</a>
<a href="https://gd.lu/rcsl/old2024">Comptes sociaux 2024</a>
<a href="https://example.invalid/foo.pdf">Altro 2024</a>
</body></html>`;

describe("Luxembourg RCSL — adapter", () => {
  it("normalizza B60814 in modo tollerante", () => {
    expect(luxembourgRcsFromInput("B60814")).toBe("B60814");
    expect(luxembourgRcsFromInput("b 60.814")).toBe("B60814");
    expect(luxembourgRcsFromInput("LURCSL.B60814")).toBe("B60814");
    expect(luxembourgRcsFromInput("LU17217953")).toBeUndefined();
  });

  it("costruisce il deep-link ufficiale LBR quando c'è il numero RCS", () => {
    expect(luxembourgCompanyUrl("B60814")).toContain("B60814");
    expect(luxembourgCompanyUrl("b 60.814")).toContain("B60814");
  });

  it("estrae solo i permalink gd.lu dei comptes sociaux e li ordina per esercizio", () => {
    const docs = parseLuxembourgPappersIndex(INDEX);
    expect(docs).toEqual([
      { year: 2025, title: "Comptes sociaux 2025", url: "https://gd.lu/rcsl/8hxWqS" },
      { year: 2024, title: "Comptes sociaux 2024", url: "https://gd.lu/rcsl/old2024" },
    ]);
  });

  it("genera endpoint interni TPbox, mai URL esterni nel payload client", () => {
    const docs = toInternalLuxembourgDocuments("B60814", parseLuxembourgPappersIndex(INDEX));
    expect(docs[0]).toMatchObject({
      id: "lu-B60814-2025",
      year: 2025,
      availability: "DOCUMENT_DOWNLOADABLE",
      downloadUrl: "/api/company-finder/document?country=LU&company=B60814&year=2025",
    });
    expect(docs[0]?.downloadUrl).not.toContain("gd.lu");
  });
});
