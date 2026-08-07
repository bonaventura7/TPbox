/**
 * Stable repository facade used by the existing Attualità server functions.
 * The implementation now reads the verified Supabase news read-model.
 */
export {
  listNewsFeed,
  listSources,
} from "../attualita/news.repository.supabase.server";
