/**
 * Repository mock del catalogo Valora.
 * Sostituibile da un adapter Supabase senza toccare la UI. Nessuna scrittura,
 * nessuna pubblicazione automatica.
 */

import { valoraCatalog } from "./catalog";
import { inspectCatalog } from "./inspector";
import type {
  QualityFinding,
  SourceCheckRow,
  SourceRegistryRow,
  SourceVersionRow,
  ValoraCatalogRepository,
} from "./types";

export type SourceHealth = "OK" | "STALE" | "UNAVAILABLE";

export interface SourceStatusView {
  readonly sourceId: string;
  readonly name: string;
  readonly officialUrl: string;
  readonly attribution: string;
  readonly health: SourceHealth;
  readonly lastVerifiedAt: string | null;
  readonly lastKnownDataDate: string | null;
  readonly note: string;
}

export function sourceStatusViews(): readonly SourceStatusView[] {
  return valoraCatalog.sources.map((source) => {
    const health: SourceHealth = source.lastVerifiedAt === null ? "STALE" : "OK";
    return {
      sourceId: source.id,
      name: source.name,
      officialUrl: source.officialUrl,
      attribution: source.attribution,
      health,
      lastVerifiedAt: source.lastVerifiedAt,
      lastKnownDataDate: source.lastKnownDataDate,
      note:
        health === "OK"
          ? "Metadati verificati manualmente: nessuna acquisizione automatica attiva."
          : "Verifica non registrata: la fonte è trattata come da verificare e non alimenta alcun calcolo.",
    };
  });
}

export const mockValoraCatalogRepository: ValoraCatalogRepository = {
  async listSources(): Promise<readonly SourceRegistryRow[]> {
    return valoraCatalog.sources.map((source) => ({
      id: source.id,
      name: source.name,
      official_url: source.officialUrl,
      attribution: source.attribution,
      acquisition_mode: "DISABLED",
      status: source.lastVerifiedAt === null ? "STALE" : "LIVE",
      created_at: `${valoraCatalog.generatedAt}T00:00:00Z`,
    }));
  },

  async listVersions(sourceId: string): Promise<readonly SourceVersionRow[]> {
    return valoraCatalog.items
      .filter((item) => item.sourceId === sourceId && item.version !== null)
      .map((item) => ({
        id: `${item.id}-version`,
        source_id: sourceId,
        version: item.version as string,
        checksum: item.checksum,
        data_date: item.lastVerifiedAt,
        created_at: `${valoraCatalog.generatedAt}T00:00:00Z`,
      }));
  },

  async listChecks(sourceId: string): Promise<readonly SourceCheckRow[]> {
    const view = sourceStatusViews().find((item) => item.sourceId === sourceId);
    if (!view) return [];
    return [
      {
        id: `${sourceId}-check`,
        source_id: sourceId,
        checked_at: `${valoraCatalog.generatedAt}T00:00:00Z`,
        outcome: view.health,
        correlation_id: `${sourceId}-seed`,
      },
    ];
  },

  async listFindings(): Promise<readonly QualityFinding[]> {
    return inspectCatalog().findings;
  },
};
