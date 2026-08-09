import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/news/NewsCard.tsx", import.meta.url), "utf8");

describe("NewsCard: rendering conditions", () => {
  it("shows DemoBadge only when isDemo is true", () => {
    expect(source).toMatch(/item\.isDemo\s*\?\s*<DemoBadge\s*\/>/);
  });

  it("does not render DemoBadge unconditionally", () => {
    const unconditional = source
      .split("\n")
      .filter((line) => line.includes("<DemoBadge"))
      .filter((line) => !line.includes("item.isDemo"));

    expect(unconditional).toEqual([]);
  });

  it("normalizes reviewedBy before showing the signature", () => {
    expect(source).toContain('item.reviewedBy?.trim() ?? ""');
    expect(source).toMatch(/\{reviewer \? \(/);
    expect(source).toContain("A cura di");
  });

  it("keeps reviewedBy optional so historical NewsItem data remains compatible", () => {
    expect(source).toMatch(/type NewsCardItem = NewsItem & \{[\s\S]*reviewedBy\?: string \| null;/);
  });

  it("does not invent an AI author semantic absent from main's domain model", () => {
    expect(source).not.toContain("AI_ASSISTED");
    expect(source).not.toContain("bozza assistita da AI");
  });
});
