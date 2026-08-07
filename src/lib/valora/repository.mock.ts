/**
 * Repository mock del catalogo Valora.
 * Sostituibile da un adapter Supabase senza toccare la UI. Nessuna scrittura,
 * nessuna pubblicazione automatica.
 */

import { valoraCatalog } from "./catalog";
import { inspectCatalog } from "./validator";
import type {
  QualityFinding,
  SourceCheckRow,
  SourceRegistryRow,
  SourceStatus,
  SourceVersionRow,
  ValoraCatalogRepository,
} from "./types";

export type SourceHealth = "OK" | "STALE" | "UNAVAILABLE";

export interface SourceStatusView {
  readonly sourceId: string;
  readonly primarySourceName: string;
  readonly canonicalUrl: string;
  readonly sourceDateOrVersion: string | null;
  readonly status: SourceStatus;
  readonly health: SourceHealth;
  readonly lastVerifiedAt: string | null;
  readonly permittedUse: string;
  readonly limitations: string;
  readonly professionalNotice: string;
  readonly note: string;
}

export function sourceStatusViews(): readonly SourceStatusView[] {
  return valoraCatalog.sources.map((source) => {
    const health: SourceHealth =
      source.status === "UNAVAILABLE"
        ? "UNAVAILABLE"
        : source.status === "VERIFIED" && source.lastVerifiedAt !== null
          ? "OK"
          : "STALE";
    return {
      sourceId: source.id,
      primarySourceName: source.primarySourceName,
      canonicalUrl: source.canonicalUrl,
      sourceDateOrVersion: source.sourceDateOrVersion,
      status: source.status,
      health,
      lastVerifiedAt: source.lastVerifiedAt,
      permittedUse: source.permittedUse,
      limitations: source.limitations,
      professionalNotice: source.professionalNotice,
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
      primary_source_name: source.primarySourceName,
      canonical_url: source.canonicalUrl,
      source_date_or_version: source.sourceDateOrVersion,
      last_verified_at: source.lastVerifiedAt,
      acquisition_mode: "DISABLED",
      status: source.status,
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
