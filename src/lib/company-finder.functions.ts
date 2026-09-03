import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { SearchResponse } from "./company-finder/types";
import { getCountry } from "./company-finder/countries";
import { officialPageFor } from "./company-finder/official-pages";
import { resolveGreekFilingUrl } from "./company-finder/greek-filing";

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

function toInPageDocumentUrl(documentUrl: string): string {
  return `/api/company-finder/document?url=${encodeURIComponent(documentUrl)}`;
}

function firstRegistryIdentifier(response: SearchResponse, fallback: string): string {
  return response.company?.registry?.id?.trim() || fallback.trim();
}

async function resolveGreekBalance(response: SearchResponse, fallbackId: string): Promise<SearchResponse> {
  if (response.company?.country.iso !== "GR" || response.financials?.documentUrl) {
    return response;
  }

  const gemi = firstRegistryIdentifier(response, fallbackId).replace(/\D/g, "");
  if (!/^\d{10}$/.test(gemi)) return response;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const filingUrl = await resolveGreekFilingUrl(gemi, controller.signal);
    if (!filingUrl) return response;

    response.financials = {
      ...(response.financials ?? { available: false, years: [] }),
      documentUrl: filingUrl,
      documentTitle: "Bilancio ufficiale — ΓΕΜΗ / BusinessPortal iXBRL",
      source: "ΓΕΜΗ — BusinessPortal iXBRL",
      note: "Documento iXBRL ufficiale individuato direttamente per la società selezionata.",
    };
    response.officialPage = undefined;
    return response;
  } catch {
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function prioritizeBalanceDocument(response: SearchResponse, fallbackId: string): Promise<SearchResponse> {
  const resolved = await resolveGreekBalance(response, fallbackId);
  const documentUrl = resolved.financials?.documentUrl;
  if (!documentUrl) return resolved;

  resolved.financials = {
    ...resolved.financials!,
    documentUrl: toInPageDocumentUrl(documentUrl),
  };
  resolved.officialPage = undefined;
  return resolved;
}

async function browserRegistryResponse(
  countryIso: string,
  identifier: string,
  query: string,
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

  return prioritizeBalanceDocument(response, cleaned);
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

    if (country === "GR" && /^\d{10}$/.test(normalized)) {
      const direct = await browserRegistryResponse("GR", normalized, query);
      if (direct) return direct;
    }

    if (country === "LU" && /^B\d+$/.test(normalized)) {
      const direct = await browserRegistryResponse("LU", normalized, query);
      if (direct) return direct;
    }

    const { runSearch } = await import("./company-finder/orchestrator");
    try {
      const response = await runSearch({ query, vat, country });
      return prioritizeBalanceDocument(response, normalized);
    } catch (error) {
      console.error("[company-finder] errore orchestratore", error);
      return emptyResponse(
        "Errore interno durante la consultazione delle fonti. Riprova tra qualche istante.",
      );
    }
  });
