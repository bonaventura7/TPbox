import { describe, expect, it } from "vitest";

import { isValidLuxembourgPdf } from "../src/routes/api.company-finder.document";
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

const MARKDOWN = `- [Comptes sociaux 2025](https://gd.lu/rcsl/8hxWqS)\n- [Other PDF 2025](https://example.invalid/x.pdf)`;

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

  it("parsa anche i link Markdown restituiti dal reader", () => {
    expect(parseLuxembourgPappersIndex(MARKDOWN)).toEqual([
      { year: 2025, title: "Comptes sociaux 2025", url: "https://gd.lu/rcsl/8hxWqS" },
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

  it("accetta solo documenti PDF reali entro il limite", () => {
    const valid = new TextEncoder().encode("%PDF-1.7\nbody").buffer;
    const html = new TextEncoder().encode("<html>captcha</html>").buffer;
    expect(isValidLuxembourgPdf(valid)).toBe(true);
    expect(isValidLuxembourgPdf(html)).toBe(false);
    expect(isValidLuxembourgPdf(new ArrayBuffer(31 * 1024 * 1024))).toBe(false);
  });
});
