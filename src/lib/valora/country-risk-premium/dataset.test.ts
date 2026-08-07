import { describe, expect, it } from "vitest";

import {
  COUNTRY_RISK_PREMIUM_MANIFEST,
  COUNTRY_RISK_PREMIUM_RECORDS,
} from "./dataset";
import { formatBasisPoints, formatCountryRiskPremiumBp } from "./format";
import { getCountryRiskPremium } from "./registry";
import { searchCountryRiskPremiums, selectVerifiedCountryRiskPremium } from "./selectors";
import { parseImportedCrpBp, validateCountryRiskPremiumDataset } from "./validation";
import type { CountryRiskPremiumRecord } from "./model";

const validRecord: CountryRiskPremiumRecord = {
  countryCode: "IT",
  countryNameIt: "Italia",
  countryNameSource: "Italy",
  countryRiskPremiumBp: 246,
  adjustedDefaultSpreadBp: 162,
  sourceId: "source.snapshot.v1",
  sourceVersion: "dataset.v1",
  dataAsOf: "2026-07-31",
  lastVerifiedAt: "2026-08-07",
  status: "VERIFIED",
  checksum: "sha256:example",
};

describe("Country Risk Premium dataset", () => {
  it("starts empty until reuse rights and snapshot verification are complete", () => {
    expect(COUNTRY_RISK_PREMIUM_RECORDS).toEqual([]);
    expect(COUNTRY_RISK_PREMIUM_MANIFEST.recordCount).toBe(0);
    expect(COUNTRY_RISK_PREMIUM_MANIFEST.sourceSnapshotVerified).toBe(false);
  });

  it("accepts a valid record only with complete source metadata", () => {
    const report = validateCountryRiskPremiumDataset([validRecord]);
    expect(report.valid).toBe(false);
    expect(report.findings.some((finding) => finding.code === "VERIFIED_RECORD_WITHOUT_SNAPSHOT")).toBe(
      true,
    );
  });

  it("detects duplicate ISO country codes", () => {
    const report = validateCountryRiskPremiumDataset([validRecord, validRecord]);
    expect(report.findings.some((finding) => finding.code === "DUPLICATE_COUNTRY_CODE")).toBe(true);
  });

  it("rejects negative or non-finite CRP and spread values", () => {
    const invalid = {
      ...validRecord,
      status: "STALE" as const,
      countryRiskPremiumBp: -1,
      adjustedDefaultSpreadBp: Number.NaN,
    };
    const report = validateCountryRiskPremiumDataset([invalid]);
    expect(report.findings.map((finding) => finding.code)).toContain("INVALID_CRp");
    expect(report.findings.map((finding) => finding.code)).toContain("INVALID_SPREAD");
  });

  it("looks up countries locally and returns null when absent", () => {
    expect(getCountryRiskPremium("it")).toBeNull();
    expect(getCountryRiskPremium("XX")).toBeNull();
    expect(selectVerifiedCountryRiskPremium("IT", [validRecord])).toEqual(validRecord);
  });

  it("searches country names case- and accent-insensitively", () => {
    const records = [
      validRecord,
      { ...validRecord, countryCode: "CI", countryNameIt: "Costa d'Avorio", countryNameSource: "Côte d'Ivoire" },
    ];
    expect(searchCountryRiskPremiums("COTE", records)).toHaveLength(1);
    expect(searchCountryRiskPremiums("costa", records)).toHaveLength(1);
    expect(searchCountryRiskPremiums("IT", records)).toHaveLength(1);
  });

  it("parses only finite non-negative imported CRP values", () => {
    expect(parseImportedCrpBp("246")).toBe(246);
    expect(parseImportedCrpBp("246.5")).toBe(246.5);
    expect(parseImportedCrpBp("-1")).toBeNull();
    expect(parseImportedCrpBp("NaN")).toBeNull();
    expect(parseImportedCrpBp("Infinity")).toBeNull();
    expect(parseImportedCrpBp("abc")).toBeNull();
    expect(parseImportedCrpBp(null)).toBeNull();
  });

  it("formats basis points for the UI without changing stored values", () => {
    expect(formatCountryRiskPremiumBp(246)).toBe("2,46%");
    expect(formatBasisPoints(162)).toBe("162 bp");
  });
});
