/**
 * Adattatore del repository mock esistente all'interfaccia NewsRepo.
 * Non riscrive né sostituisce `news.repository.server.ts`: lo incapsula.
 */
import type { NewsFeedResult, NewsFilters, NewsSource } from "../domain/types";
import type { NewsRepo } from "./news.repo";
import { listNewsFeed, listSources } from "./news.repository.server";

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

export const mockNewsRepo: NewsRepo = {
  kind: "MOCK",
  getPublished,
  getSources,
};
