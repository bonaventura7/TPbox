import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { SearchResponse } from "./company-finder/types";
import { getCountry } from "./company-finder/countries";
import { officialPageFor } from "./company-finder/official-pages";

/**
 * Company Finder — punto di ingresso lato server.
 *
 * L'orchestratore consulta in parallelo le fonti ufficiali che funzionano lato
 * server. Alcuni registri, invece, devono essere aperti direttamente nel
 * browser dell'utente perché richiedono autenticazione, CAPTCHA o sessione.
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

function browserRegistryResponse(
  countryIso: string,
  identifier: string,
  query: string,
): SearchResponse | undefined {
  const country = getCountry(countryIso);
  if (!country) return undefined;

  const officialPage = officialPageFor(countryIso, identifier, query);
  if (!officialPage) return undefined;

  const cleaned = identifier.trim();
  return {
    found: true,
    company: {
      name: query.trim() || `${country.nameIt} — ${cleaned}`,
      country,
      registry: {
        name: officialPage.label,
        id: cleaned,
      },
    },
    financials: {
      available: false,
      years: [],
      note:
        countryIso === "PL"
          ? "Per il documento finanziario usa il registro RDF ufficiale: la ricerca del deposito e il download avvengono nel browser."
          : "La scheda del registro ufficiale viene aperta nel browser dell'utente; eventuali autenticazione o verifica del browser restano nel portale ufficiale.",
    },
    sources: [
      {
        id: "official-browser",
        label: officialPage.label,
        state: "ok",
        detail: "consultazione ufficiale da browser",
      },
    ],
    warnings: [],
    searchedAt: new Date().toISOString(),
    officialPage,
  };
}

export const findCompany = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => searchSchema.parse(data ?? {}))
  .handler(async ({ data }): Promise<SearchResponse> => {
    const query = data.query.trim();
    const vat = data.vat.trim();
    const country = data.country.trim().toUpperCase();
    const normalized = vat.replace(/[\s.-]/g, "").toUpperCase();

    if (query.length === 0 && vat.length === 0) {
      return emptyResponse("Inserisci la ragione sociale oppure il numero di partita IVA.");
    }

    // Workaround fail-safe: questi identificativi NON sono numeri IVA e non
    // devono mai finire nel VIES. Li trattiamo come identificativi del registro
    // e restituiamo direttamente la pagina ufficiale da aprire nel browser.
    if (country === "GR" && /^\d{10}$/.test(normalized)) {
      const direct = browserRegistryResponse("GR", normalized, query);
      if (direct) return direct;
    }

    if (country === "LU" && /^B\d+$/.test(normalized)) {
      const direct = browserRegistryResponse("LU", normalized, query);
      if (direct) return direct;
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
