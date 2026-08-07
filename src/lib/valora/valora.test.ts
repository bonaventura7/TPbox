import { describe, expect, it } from "vitest";

import { VALORA_SOURCE_STATUSES, filterItems, valoraCatalog } from "./catalog";
import { daysSince, inspectCatalog, isAllowedUrl, isValoraRoute } from "./validator";

describe("catalogo Valora", () => {
  it("ha id stabili e unici", () => {
    const ids = valoraCatalog.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("riferisce solo fonti registrate", () => {
    const sourceIds = new Set(valoraCatalog.sources.map((s) => s.id));
    for (const item of valoraCatalog.items) expect(sourceIds.has(item.sourceId)).toBe(true);
  });

  it("copre le schede previste dal catalogo MVP", () => {
    for (const id of [
      "valora-wacc",
      "valora-beta",
      "valora-crp",
      "valora-credit-spread",
      "valora-dcf-fcff",
    ]) {
      expect(valoraCatalog.items.some((item) => item.id === id)).toBe(true);
    }
  });

  it("espone solo fonti primarie con URL canonico HTTPS e stato valido", () => {
    for (const source of valoraCatalog.sources) {
      expect(source.tier).toBe("PRIMARY");
      expect(source.primarySourceName.trim().length).toBeGreaterThan(0);
      expect(isAllowedUrl(source.canonicalUrl)).toBe(true);
      expect(VALORA_SOURCE_STATUSES).toContain(source.status);
      expect(source.permittedUse.trim().length).toBeGreaterThan(0);
      expect(source.limitations.trim().length).toBeGreaterThan(0);
      expect(source.professionalNotice.trim().length).toBeGreaterThan(0);
      // lastVerifiedAt è nullable: nessun fallback inventato.
      expect(
        source.lastVerifiedAt === null || /^\d{4}-\d{2}-\d{2}$/.test(source.lastVerifiedAt),
      ).toBe(true);
      expect(source.sourceDateOrVersion === null || source.sourceDateOrVersion.length > 0).toBe(
        true,
      );
    }
  });

  it("dichiara solo percorsi interni Valora", () => {
    for (const item of valoraCatalog.items) {
      if (item.route !== null) expect(isValoraRoute(item.route)).toBe(true);
    }
  });

  it("filtra per testo, categoria e stato", () => {
    expect(filterItems(valoraCatalog.items, { query: "wacc" }).length).toBeGreaterThan(0);
    expect(filterItems(valoraCatalog.items, { query: "zzz-non-esiste" })).toHaveLength(0);
    expect(
      filterItems(valoraCatalog.items, { category: "VALUATION" }).every(
        (i) => i.category === "VALUATION",
      ),
    ).toBe(true);
    expect(
      filterItems(valoraCatalog.items, { status: "STALE" }).every((i) => i.status === "STALE"),
    ).toBe(true);
  });
});

describe("validator", () => {
  it("accetta solo URL HTTPS su host in allowlist", () => {
    expect(isAllowedUrl("https://www.oecd.org/x")).toBe(true);
    expect(isAllowedUrl("http://www.oecd.org/x")).toBe(false);
    expect(isAllowedUrl("https://example.com/x")).toBe(false);
    expect(isAllowedUrl("non-un-url")).toBe(false);
  });

  it("accetta solo percorsi interni Valora", () => {
    expect(isValoraRoute("/tool/valora")).toBe(true);
    expect(isValoraRoute("/tool/valora/wacc")).toBe(true);
    expect(isValoraRoute("/tool/altro")).toBe(false);
    expect(isValoraRoute("https://esterno.example/tool/valora")).toBe(false);
  });

  it("non produce errori bloccanti sul catalogo corrente", () => {
    const report = inspectCatalog();
    expect(report.errors).toBe(0);
    expect(report.passed).toBe(true);
  });

  it("segnala metadati mancanti", () => {
    const report = inspectCatalog();
    const codes = report.findings.map((f) => f.code);
    expect(codes).toContain("VERIFICATION_MISSING");
    expect(codes).toContain("VERSION_MISSING");
  });

  it("calcola l'età della verifica", () => {
    expect(daysSince("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysSince("non-data", "2026-01-31")).toBeNull();
  });
});
