import { describe, expect, it } from "vitest";

import {
  EU_MEMBER_STATE_CODES,
  findDuplicateCountryCodes,
  validateCompanyQuery,
  validateCountryCode,
  validateVerifiedSource,
} from "./validation";
import type { CompanyRegistrySource } from "./types";

const verifiedSource: CompanyRegistrySource = {
  id: "1",
  country_code: "IT",
  country_name_it: "Italia",
  country_name_local: "Italia",
  eu_member_state: true,
  official_register_name: "Registro delle imprese",
  official_register_url: "https://italianbusinessregister.it",
  official_register_host: "italianbusinessregister.it",
  official_information_url: "https://italianbusinessregister.it",
  official_information_host: "italianbusinessregister.it",
  search_mode: "EXTERNAL_REGISTER",
  search_url_template: null,
  api_adapter_key: null,
  access_type: "PARTLY_FREE",
  document_access: "PAID",
  terms_status: "VERIFIED",
  last_verified_at: "2026-08-07T00:00:00Z",
  status: "VERIFIED",
  notes: null,
};

describe("company registry validation", () => {
  it("contains exactly the 27 EU member states", () => {
    expect(EU_MEMBER_STATE_CODES).toHaveLength(27);
    expect(new Set(EU_MEMBER_STATE_CODES).size).toBe(27);
  });

  it("validates EU country codes and rejects non-EU codes", () => {
    expect(validateCountryCode("IT")).toBe(true);
    expect(validateCountryCode("se")).toBe(true);
    expect(validateCountryCode("CH")).toBe(false);
  });

  it("validates company queries", () => {
    expect(validateCompanyQuery("ACME")).toBe(true);
    expect(validateCompanyQuery("  ")).toBe(false);
    expect(validateCompanyQuery("a".repeat(161))).toBe(false);
  });

  it("requires verified HTTPS official sources and matching hosts", () => {
    expect(validateVerifiedSource(verifiedSource)).toEqual([]);
    expect(validateVerifiedSource({ ...verifiedSource, official_register_url: "http://italianbusinessregister.it" })).toContain("REGISTER_HOST_MISMATCH");
    expect(validateVerifiedSource({ ...verifiedSource, official_register_host: "example.com" })).toContain("REGISTER_HOST_MISMATCH");
    expect(validateVerifiedSource({ ...verifiedSource, status: "UNDER_REVIEW" })).toContain("NOT_VERIFIED");
  });

  it("detects duplicate country codes", () => {
    expect(findDuplicateCountryCodes([{ country_code: "IT" }, { country_code: "DE" }, { country_code: "IT" }])).toEqual(["IT"]);
  });
});
