/**
 * Vista di sola lettura sullo stato delle fonti del catalogo statico.
 * Nessuna scrittura, nessuna rete, nessuna pubblicazione automatica.
 */

import { valoraCatalog } from "./catalog";
import type { SourceStatus } from "./types";

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
          : "Verifica non registrata: la fonte è trattata come da verificare e non alimenta alcun contenuto.",
    };
  });
}
