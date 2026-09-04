import { describe, expect, it } from "vitest";
import { parseTreasuryXml } from "./treasury";

describe("Treasury daily par yield XML", () => {
  it("parses the official CMT fields into dated observations", () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><content type="application/xml"><d:properties xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata"><d:NEW_DATE m:type="Edm.DateTime">2026-09-02T00:00:00</d:NEW_DATE><d:BC_3MONTH>3.92</d:BC_3MONTH><d:BC_6MONTH>4.05</d:BC_6MONTH><d:BC_1YEAR>4.16</d:BC_1YEAR><d:BC_2YEAR>4.39</d:BC_2YEAR><d:BC_3YEAR>4.47</d:BC_3YEAR><d:BC_5YEAR>4.54</d:BC_5YEAR><d:BC_7YEAR>4.65</d:BC_7YEAR><d:BC_10YEAR>4.79</d:BC_10YEAR></d:properties></content></entry></feed>`;

    expect(parseTreasuryXml(xml)).toEqual([
      { date: "2026-09-02", series: "BC_3MONTH", value: 3.92 },
      { date: "2026-09-02", series: "BC_6MONTH", value: 4.05 },
      { date: "2026-09-02", series: "BC_1YEAR", value: 4.16 },
      { date: "2026-09-02", series: "BC_2YEAR", value: 4.39 },
      { date: "2026-09-02", series: "BC_3YEAR", value: 4.47 },
      { date: "2026-09-02", series: "BC_5YEAR", value: 4.54 },
      { date: "2026-09-02", series: "BC_7YEAR", value: 4.65 },
      { date: "2026-09-02", series: "BC_10YEAR", value: 4.79 },
    ]);
  });
});
