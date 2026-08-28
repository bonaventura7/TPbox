import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { SearchResponse } from "./company-finder/types";

/**
 * Company Finder — punto di ingresso lato server.
 *
 * L'orchestratore (`lib/company-finder/orchestrator`) consulta in parallelo il
 * registro nazionale del paese, il VIES della Commissione Europea e, quando
 * esiste una fonte gratuita, il deposito dei conti annuali. Ogni chiamata parte
 * da qui: il browser non contatta mai un registro esterno e l'utente non viene
 * mai reindirizzato fuori dal sito.
 */
const searchSchema = z.object({
  query: z.string().max(200).default(""),
  vat: z.string().max(40).default(""),
  country: z.string().max(2).default(""),
});

function emptyResponse(warning: string): SearchResponse {
  return {
    found: false,
    sources: [],
    warnings: [warning],
    searchedAt: new Date().toISOString(),
  };
}

export const findCompany = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => searchSchema.parse(data ?? {}))
  .handler(async ({ data }): Promise<SearchResponse> => {
    const query = data.query.trim();
    const vat = data.vat.trim();
    const country = data.country.trim().toUpperCase();

    if (query.length === 0 && vat.length === 0) {
      return emptyResponse("Inserisci la ragione sociale oppure il numero di partita IVA.");
    }

    const { runSearch } = await import("./company-finder/orchestrator");
    try {
      return await runSearch({ query, vat, country });
    } catch (error) {
      console.error("[company-finder] errore orchestratore", error);
      return emptyResponse(
        "Errore interno durante la consultazione delle fonti. Riprova tra qualche istante.",
      );
    }
  });
