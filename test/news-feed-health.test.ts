import { afterEach, describe, expect, it, vi } from "vitest";

import { listNewsFeed } from "../src/lib/repositories/news.repository.server";
import { DEMO_NEWS } from "../src/lib/domain/demo-data";

/**
 * Il feed dimostrativo dichiarava al lettore: «Contenuti non recenti: l'ultimo
 * aggiornamento della pipeline redazionale risale a un intervallo superiore alle
 * 36 ore». Il messaggio nasceva da una costante scritta a mano
 * (`LAST_PIPELINE_RUN_AT = "2026-08-04T07:20:00Z"`) confrontata con l'orologio:
 * dal 5 agosto in poi la condizione era vera per sempre.
 *
 * Il punto non è che il banner fosse brutto. È che non esiste alcuna pipeline
 * redazionale dietro il dataset demo, quindi quel banner era telemetria inventata
 * su un portale il cui argomento di vendita è la verificabilità della fonte. Lo
 * stato di freschezza appartiene al repository reale, dove `lastPipelineRunAt`
 * viene da un fatto; nel mock deve essere derivato dai dati, non simulato.
 */

const FILTERS = {
  query: "",
  geo: "TUTTE",
  topic: "TUTTI",
  category: "TUTTE",
  country: "",
  institutionalOnly: false,
} as const;

afterEach(() => {
  vi.useRealTimers();
});

describe("salute del feed dimostrativo", () => {
  it("non diventa STALE col passare del tempo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2029-01-01T00:00:00Z"));

    const feed = await listNewsFeed({ ...FILTERS });

    expect(feed.health, "il mock sta simulando una pipeline che non esiste").not.toBe("STALE");
  });

  it("resta coerente anche a ridosso dei dati demo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T10:00:00Z"));

    const feed = await listNewsFeed({ ...FILTERS });

    expect(feed.health).not.toBe("STALE");
  });

  it("lastPipelineRunAt è derivato dalla verifica più recente dei dati demo", async () => {
    const feed = await listNewsFeed({ ...FILTERS });

    const mostRecent = DEMO_NEWS.filter((item) => item.workflowState === "PUBLISHED")
      .map((item) => item.lastVerifiedAt)
      .sort()
      .at(-1);

    expect(feed.lastPipelineRunAt).toBe(mostRecent);
  });

  it("continua a restituire gli articoli pubblicati", async () => {
    const feed = await listNewsFeed({ ...FILTERS });

    expect(feed.archive.length).toBeGreaterThan(0);
    expect(feed.featured).not.toBeNull();
  });
});
