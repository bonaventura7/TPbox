/**
 * Adattatore del repository mock esistente all'interfaccia NewsRepo.
 * Non riscrive né sostituisce `news.repository.server.ts`: lo incapsula.
 */
import type { NewsFeedResult, NewsFilters, NewsItem, NewsSource } from "../domain/types";
import type { NewsRepo } from "./news.repo";
import { findNewsBySlug, listNewsFeed, listSources } from "./news.repository.server";

async function getPublished(filters: NewsFilters): Promise<NewsFeedResult> {
  const result = await listNewsFeed(filters);
  return {
    ...result,
    repoKind: "MOCK",
    repoStatus: result.archive.length === 0 ? "EMPTY" : "OK",
    rejectedRows: 0,
  };
}

async function getSources(): Promise<NewsSource[]> {
  return Promise.resolve(listSources());
}

async function getBySlug(slug: string): Promise<NewsItem | null> {
  return Promise.resolve(findNewsBySlug(slug));
}

export const mockNewsRepo: NewsRepo = {
  kind: "MOCK",
  getPublished,
  getSources,
  getBySlug,
};
