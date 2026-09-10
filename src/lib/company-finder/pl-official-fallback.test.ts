import { describe, expect, it } from "vitest";

import {
  POLISH_OFFICIAL_FALLBACK_HEADER,
  polishOfficialBrowserUrl,
  polishOfficialFallbackResponse,
} from "./pl-official-fallback";

describe("Polish official RDF fallback", () => {
  it("builds a KRS-specific public browser URL", () => {
    expect(polishOfficialBrowserUrl("KRS 0000002594")).toBe(
      "https://rdf-przegladarka.ms.gov.pl/wyszukaj-podmiot?krs=0000002594",
    );
  });

  it("redirects to the official browser when automated providers are exhausted", () => {
    const fallback = polishOfficialFallbackResponse("0000002594");

    expect(fallback.status).toBe(302);
    expect(fallback.headers.get("Location")).toBe(
      "https://rdf-przegladarka.ms.gov.pl/wyszukaj-podmiot?krs=0000002594",
    );
    expect(fallback.headers.get("X-Company-Finder-Fallback")).toBe(POLISH_OFFICIAL_FALLBACK_HEADER);
    expect(fallback.headers.get("Cache-Control")).toBe("no-store");
  });
});
