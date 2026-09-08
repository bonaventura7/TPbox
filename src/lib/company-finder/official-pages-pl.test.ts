import { describe, expect, it } from "vitest";

import { officialPageFor } from "./official-pages";

describe("Poland financial document destination", () => {
  it("builds the company-specific ALEO page from the verified KRS legal name", () => {
    const page = officialPageFor(
      "PL",
      "0000002594",
      '"AVIO POLSKA" SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
    );

    expect(page?.url).toBe(
      "https://aleo.com/pl/firma/avio-polska-spolka-z-ograniczona-odpowiedzialnoscia",
    );
    expect(page?.actionLabel).toBe("Apri i bilanci della società");
    expect(page?.url).not.toContain("rdf/pd/search_df");
    expect(page?.url).not.toContain("imsig.pl");
  });

  it("does not fall back to a generic KRS page when the legal name is verified", () => {
    const page = officialPageFor("PL", "0000002594", "AVIO POLSKA");

    expect(page?.url).toBe("https://aleo.com/pl/firma/avio-polska");
  });
});
