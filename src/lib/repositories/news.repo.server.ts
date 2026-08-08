/**
 * Selettore del repository Attualità.
 * Default: mock. Il repo reale si attiva solo con VITE_USE_REAL_REPO="true".
 */
import { useRealNewsRepo } from "../platform/feature-flags";
import { mockNewsRepo } from "./news.mock.repo.server";
import type { NewsRepo } from "./news.repo";
import { realNewsRepo } from "./news.real.repo.server";

export function getNewsRepo(): NewsRepo {
  return useRealNewsRepo() ? realNewsRepo : mockNewsRepo;
}
