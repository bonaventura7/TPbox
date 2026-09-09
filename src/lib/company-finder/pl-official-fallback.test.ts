import { describe, expect, it } from "vitest";

import { polishOfficialBrowserUrl } from "./pl-official-fallback";

describe("Polish official RDF fallback", () => {
  it("builds a KRS-specific public browser URL", () => {
    expect(polishOfficialBrowserUrl("KRS 0000002594")).toBe(
      "https://rdf-przegladarka.ms.gov.pl/wyszukaj-podmiot?krs=0000002594",
    );
  });
});
