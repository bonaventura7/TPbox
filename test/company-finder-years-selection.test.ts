import { describe, expect, it } from "vitest";

import type { SearchRequest } from "../src/lib/company-finder/types";

describe("SearchRequest.years", () => {
  it("accetta un elenco di esercizi", () => {
    const request: SearchRequest = {
      query: "Test",
      vat: "",
      country: "SK",
      years: [2024, 2023],
    };
    expect(request.years).toEqual([2024, 2023]);
  });

  it("resta opzionale: una richiesta senza years è valida", () => {
    const request: SearchRequest = { query: "Test", vat: "", country: "SK" };
    expect(request.years).toBeUndefined();
  });
});
