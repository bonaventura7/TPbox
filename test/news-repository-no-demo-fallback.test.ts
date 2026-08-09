import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewsFilters } from "../src/lib/domain/types";

/**
 * La garanzia difesa qui è editoriale prima che tecnica: la sezione Attualità non deve
 * mai servire contenuti dimostrativi come se fossero reali.
 *
 * Un fallback ai DEMO_NEWS quando la query fallisce sembra una rete di sicurezza. Non lo
 * è: il portale porta la firma di un professionista, i demo sono indistinguibili dagli
 * articoli veri per chi legge, e il flag isDemo vive nel codice — il lettore non lo vede
 * mai. Servire demo nel momento in cui il database non risponde significa mentire
 * esattamente quando il sistema non è in grado di dire la verità.
 *
 * Il test è comportamentale e non testuale: verifica cosa il repository restituisce nei
 * tre casi che contano, non come è scritto.
 */

const ORDER = vi.fn();

vi.mock("../src/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({ select: () => ({ order: ORDER }) }),
  },
}));

const FILTERS: NewsFilters = {
  query: "",
  geo: "TUTTE",
  topic: "TUTTI",
  category: "TUTTE",
  country: "",
  institutionalOnly: false,
};

const ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "provvedimento-esempio",
  title: "Provvedimento del Direttore",
  summary: "Sintesi",
  content_markdown: "# corpo",
  category: "Transfer Pricing",
  country: "Italia",
  source_name: "Agenzia delle Entrate",
  source_url: "https://agenziaentrate.gov.it/atto",
  pdf_url: null,
  normative_references: ["art. 110 c. 7 TUIR"],
  published_at: "2026-08-09T10:00:00.000Z",
  created_at: "2026-08-09T09:00:00.000Z",
  updated_at: "2026-08-09T10:00:00.000Z",
  author_type: "HUMAN",
  reviewed_by: "Luca Consalter",
  primary_source_verified_at: "2026-08-09T09:30:00.000Z",
  geo: "ITALIA",
  topic: "Documentazione",
  language: "it",
  source_kind: "ISTITUZIONALE",
  source_tier: "PRIMARY",
};

async function listNewsFeed() {
  vi.resetModules();
  const mod = await import("../src/lib/repositories/news.repository.server");
  return mod.listNewsFeed(FILTERS);
}

describe("Attualità: nessun contenuto dimostrativo servito come reale", () => {
  beforeEach(() => {
    delete process.env["NEWS_DEMO_MODE"];
    ORDER.mockReset();
  });

  it("restituisce gli articoli del database, marcati come non dimostrativi", async () => {
    ORDER.mockResolvedValue({ data: [ROW], error: null });
    const feed = await listNewsFeed();

    expect(feed.archive).toHaveLength(1);
    expect(feed.archive[0]?.isDemo).toBe(false);
    expect(feed.archive[0]?.title).toBe("Provvedimento del Direttore");
    expect(feed.archive[0]?.reviewedBy).toBe("Luca Consalter");
    expect(feed.archive[0]?.sourceTier).toBe("PRIMARY");
  });

  it("con la query in errore la sezione resta vuota e non ripiega sui demo", async () => {
    ORDER.mockResolvedValue({ data: null, error: { message: "connessione rifiutata" } });
    const feed = await listNewsFeed();

    expect(feed.archive).toHaveLength(0);
    expect(feed.featured).toBeNull();
    expect(feed.totalPublished).toBe(0);
    expect(feed.health).toBe("DEGRADED");
  });

  it("senza articoli pubblicati non inventa nulla", async () => {
    ORDER.mockResolvedValue({ data: [], error: null });
    const feed = await listNewsFeed();

    expect(feed.archive).toHaveLength(0);
    expect(feed.totalPublished).toBe(0);
    expect(feed.draftsPending).toBe(0);
    expect(feed.health).toBe("STALE");
  });

  it("nessun articolo restituito è mai dimostrativo, in nessuno dei tre casi", async () => {
    for (const outcome of [
      { data: [ROW], error: null },
      { data: null, error: { message: "boom" } },
      { data: [], error: null },
    ]) {
      ORDER.mockResolvedValue(outcome);
      const feed = await listNewsFeed();
      const everything = [...feed.archive, ...feed.latest, feed.featured].filter(Boolean);
      expect(everything.every((item) => item?.isDemo === false)).toBe(true);
    }
  });
});
