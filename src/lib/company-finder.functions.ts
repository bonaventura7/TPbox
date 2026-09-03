import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { SearchResponse } from "./company-finder/types";
import { getCountry } from "./company-finder/countries";
import { officialPageFor } from "./company-finder/official-pages";
import { documentViewerUrl } from "./company-finder/document-links";
import {
  extractGemiFromText,
  isGreekDocumentUrl,
  normalizeGemi,
  normalizeGreekVat,
} from "./company-finder/greece";
import { applyGreekDocuments } from "./company-finder/greek-financials.server";

const searchSchema = z.object({
  query: z.string().max(200).default(""),
  vat: z.string().max(40).default(""),
  country: z.string().max(2).default(""),
  /**
   * Link ufficiale del documento, quando l'utente lo ha già. Il server lo
   * valida (solo host e path del registro) e lo serve in pagina: anche in
   * questo caso l'utente non esce dal sito.
   */
  documentUrl: z.string().max(600).default(""),
});

function emptyResponse(warning: string): SearchResponse {
  return {
    found: false,
    sources: [],
    warnings: [warning],
    searchedAt: new Date().toISOString(),
  };
}

function firstRegistryIdentifier(response: SearchResponse, fallback: string): string {
  return response.company?.registry?.id?.trim() || fallback.trim();
}

async function prioritizeBalanceDocument(
  response: SearchResponse,
  fallbackId: string,
  attachedDocumentUrl: string,
): Promise<SearchResponse> {
  const resolved = await applyGreekDocuments(response, fallbackId, attachedDocumentUrl);
  if (resolved.financials?.documents?.length) {
    resolved.officialPage = undefined;
    return resolved;
  }

  const documentUrl = resolved.financials?.documentUrl;
  if (!documentUrl) return resolved;

  resolved.financials = {
    ...resolved.financials!,
    documentUrl: documentUrl.startsWith("/") ? documentUrl : documentViewerUrl(documentUrl),
  };
  resolved.officialPage = undefined;
  return resolved;
}

async function browserRegistryResponse(
  countryIso: string,
  identifier: string,
  query: string,
  attachedDocumentUrl: string,
): Promise<SearchResponse | undefined> {
  const country = getCountry(countryIso);
  if (!country) return undefined;

  const officialPage = officialPageFor(countryIso, identifier, query);
  if (!officialPage) return undefined;

  const cleaned = identifier.trim();
  const response: SearchResponse = {
    found: true,
    company: {
      name: query.trim() || `${country.nameIt} — ${cleaned}`,
      country,
      registry: {
        name: officialPage.label,
        authority: country.registryAuthority,
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

  return prioritizeBalanceDocument(response, cleaned, attachedDocumentUrl);
}

export const findCompany = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => searchSchema.parse(data ?? {}))
  .handler(async ({ data }): Promise<SearchResponse> => {
    const query = data.query.trim();
    const vat = data.vat.trim();
    const country = data.country.trim().toUpperCase();
    const normalized = vat.replace(/[\s.-]/g, "").toUpperCase();
    const attachedDocumentUrl = data.documentUrl.trim();

    if (query.length === 0 && vat.length === 0 && attachedDocumentUrl.length === 0) {
      return emptyResponse("Inserisci la ragione sociale oppure il numero di partita IVA.");
    }

    if (country === "GR") {
      const gemi =
        normalizeGemi(normalized) ?? extractGemiFromText(normalized) ?? extractGemiFromText(query);
      const greekVat = normalizeGreekVat(normalized);
      const greekId = gemi?.gemi ?? greekVat ?? normalized;
      if (gemi || greekVat || attachedDocumentUrl) {
        const direct = await browserRegistryResponse("GR", greekId, query, attachedDocumentUrl);
        if (direct) return direct;
      }
    }

    if (country === "LU" && /^B\d+$/.test(normalized)) {
      const direct = await browserRegistryResponse("LU", normalized, query, attachedDocumentUrl);
      if (direct) return direct;
    }

    const { runSearch } = await import("./company-finder/orchestrator");
    try {
      const response = await runSearch({ query, vat, country });
      return prioritizeBalanceDocument(response, normalized, attachedDocumentUrl);
    } catch (error) {
      console.error("[company-finder] errore orchestratore", error);
      return emptyResponse(
        "Errore interno durante la consultazione delle fonti. Riprova tra qualche istante.",
      );
    }
  });
