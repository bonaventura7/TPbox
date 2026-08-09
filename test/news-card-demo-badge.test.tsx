import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NewsCard, NewsMeta } from "../src/components/news/NewsCard";
import type { NewsItem } from "../src/lib/domain/types";

const baseItem = {
  id: "news-test-1",
  title: "Test news",
  summary: "Test summary",
  sourceId: "source-test-1",
  sourceName: "Test source",
  sourceKind: "ISTITUZIONALE",
  sourceTier: "PRIMARY",
  originalDate: "2026-08-09T00:00:00.000Z",
  lastVerifiedAt: "2026-08-09T12:00:00.000Z",
  language: "it",
  geo: "ITALIA",
  topic: "Documentazione",
  originalUrl: "https://example.com/news-test-1",
  workflowState: "PUBLISHED",
  isDemo: false,
} satisfies NewsItem;

type NewsCardFixture = NewsItem & {
  reviewedBy?: string | null;
};

function makeItem(overrides: Partial<NewsCardFixture> = {}): NewsCardFixture {
  return { ...baseItem, ...overrides };
}

function renderCard(item: NewsCardFixture): string {
  return renderToStaticMarkup(<NewsCard item={item} />);
}

function renderMeta(item: NewsCardFixture): string {
  return renderToStaticMarkup(<NewsMeta item={item} />);
}

describe("NewsCard: rendering conditions", () => {
  it("shows DemoBadge when isDemo is true", () => {
    expect(renderCard(makeItem({ isDemo: true }))).toContain("Dato demo");
  });

  it("does not show DemoBadge when isDemo is false", () => {
    expect(renderCard(makeItem({ isDemo: false }))).not.toContain("Dato demo");
  });

  it("shows the reviewer signature when reviewedBy is populated", () => {
    const markup = renderMeta(makeItem({ reviewedBy: "Luca Consalter" }));

    expect(markup).toContain("A cura di");
    expect(markup).toContain("Luca Consalter");
  });

  it("does not show the reviewer signature when reviewedBy is null", () => {
    expect(renderMeta(makeItem({ reviewedBy: null }))).not.toContain("A cura di");
  });

  it("does not show the reviewer signature when reviewedBy is empty", () => {
    expect(renderMeta(makeItem({ reviewedBy: "" }))).not.toContain("A cura di");
  });

  it("does not show the reviewer signature when reviewedBy is whitespace", () => {
    expect(renderMeta(makeItem({ reviewedBy: "   \t  " }))).not.toContain("A cura di");
  });

  it("continues to render an item with no reviewedBy field", () => {
    const markup = renderCard(makeItem());

    expect(markup).toContain("Test news");
    expect(markup).toContain("Test summary");
    expect(markup).not.toContain("A cura di");
  });

  it("trims surrounding whitespace from a populated reviewedBy value", () => {
    const markup = renderMeta(makeItem({ reviewedBy: "  Luca Consalter  " }));

    expect(markup).toContain("Luca Consalter");
    expect(markup).not.toContain("  Luca Consalter  ");
  });

  it("renders the compact variant without reviewedBy", () => {
    const markup = renderToStaticMarkup(<NewsCard item={makeItem()} variant="compact" />);

    expect(markup).toContain("Test news");
    expect(markup).not.toContain("A cura di");
  });

  it("does not show an AI label without a corresponding data contract", () => {
    const markup = renderCard(makeItem());

    expect(markup).not.toContain("bozza assistita da AI");
    expect(markup).not.toContain("AI_ASSISTED");
  });
});
