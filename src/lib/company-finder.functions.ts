import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { SearchResponse } from "./company-finder/types";
import { getCountry } from "./company-finder/countries";
import { officialPageFor } from "./company-finder/official-pages";
import { resolveGreekFilingUrl } from "./company-finder/greek-filing";
import { numericRegistryId, searchGleif } from "./company-finder/sources/gleif";

const searchSchema = z.object({
  query: z.string().max(200).default(""),
  vat: z.string().max(40).default(""),
  country: z.string().max(2).default(""),
});

const POLISH_KRS_REGISTRATION_AUTHORITY = "RA000484";

function emptyResponse(warning: string): SearchResponse {
  return {
    found: false,
    sources: [],
    warnings: [warning],
    searchedAt: new Date().toISOString(),
  };
}

function toInPageDocumentUrl(documentUrl: string): string {
  if (documentUrl.startsWith("/api/company-finder/document?")) return documentUrl;
  return `/api/company-finder/document?url=${encodeURIComponent(documentUrl)}`;
}

function firstRegistryIdentifier(response: SearchResponse, fallback: string): string {
  return response.company?.registry?.id?.trim() || fallback.trim();
}

export interface PolishKrsResolution {
  krs?: string | undefined;
  detail?: string | undefined;
}

/**
 * Resolver keyless: GLEIF viene usato esclusivamente come indice del registro
 * nazionale. Per la Polonia accettiamo solo record il cui Registered At è il
 * National Court Register (RA000484); il numero viene poi verificato dal KRS
 * ufficiale tramite l'orchestratore.
 */
export async function resolvePolishKrsByName(
  query: string,
  timeoutMs = 10000,
): Promise<PolishKrsResolution> {
  const term = query.trim();
  if (term.length < 3) return { detail: "nome troppo corto per la risoluzione KRS" };

  const result = await searchGleif(term, "PL", timeoutMs);
  if (!result.ok) return { detail: result.error ?? "resolver GLEIF non raggiungibile" };
  if (result.matches.length === 0) {
    return { detail: "nessuna entità polacca con LEI corrisponde alla denominazione" };
  }

  for (const match of result.matches) {
    if (match.country !== "PL" || match.registeredAt !== POLISH_KRS_REGISTRATION_AUTHORITY)
      continue;
    const registeredAs = numericRegistryId(match.registeredAs);
    if (!registeredAs) continue;
    const krs = registeredAs.padStart(10, "0");
    if (!/^\d{10}$/.test(krs)) continue;
    return {
      krs,
      detail: `KRS ${krs} risolto da GLEIF → ${POLISH_KRS_REGISTRATION_AUTHORITY}`,
    };
  }

  return {
    detail:
      "GLEIF ha trovato entità polacche, ma nessuna espone un identificativo KRS verificabile come Registered At KRS",
  };
}

async function resolveGreekBalance(
  response: SearchResponse,
  fallbackId: string,
): Promise<SearchResponse> {
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

async function attachPolishFinancialDocuments(
  response: SearchResponse,
  krsNumber: string,
): Promise<SearchResponse> {
  const krs = krsNumber.replace(/\D/g, "").padStart(10, "0");
  if (!/^\d{10}$/.test(krs)) return response;

  try {
    const { searchPolishAnnualReports } = await import(
      "./company-finder/sources/bilanci/poland-rdf"
    );
    const result = await searchPolishAnnualReports(krs);
    if (!result.ok || result.documents.length === 0) {
      response.warnings = [
        result.error ?? "nessun bilancio annuale reperibile nel RDF KRS",
        ...response.warnings,
      ];
      return response;
    }

    const documents = result.documents.map((document) => ({
      id: document.id,
      year: document.year,
      kind: "ANNUAL_REPORT" as const,
      format: document.format,
      availability: "DOCUMENT_DOWNLOADABLE" as const,
      title: document.title,
      downloadUrl: `/api/company-finder/document?country=PL&company=${encodeURIComponent(krs)}${document.year ? `&year=${document.year}` : ""}&download=1`,
    }));

    response.financials = {
      ...(response.financials ?? { available: false, years: [] }),
      source: "KRS RDF — Ministerstwo Sprawiedliwości",
      note:
        "I documenti finanziari sono recuperati dal servizio ufficiale RDF del Ministero della Giustizia e scaricati tramite endpoint TPbox; il browser non viene inviato alla pagina generica search_df.",
      documents,
    };
    response.officialPage = undefined;
    return response;
  } catch (error) {
    response.warnings = [
      error instanceof Error ? error.message : "errore nel recupero dei bilanci RDF KRS",
      ...response.warnings,
    ];
    return response;
  }
}

async function prioritizeBalanceDocument(
  response: SearchResponse,
  fallbackId: string,
): Promise<SearchResponse> {
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
          ? "Il bilancio viene raggiunto dalla pagina finanziaria specifica della società; il KRS ufficiale resta la fonte primaria del deposito."
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

    let effectiveVat = vat;
    let polishResolution: PolishKrsResolution | undefined;
    if (country === "PL" && query.length >= 3 && normalized.length === 0) {
      polishResolution = await resolvePolishKrsByName(query);
      if (polishResolution.krs) effectiveVat = `PL${polishResolution.krs}`;
    }

    const { runSearch } = await import("./company-finder/orchestrator");
    try {
      const response = await runSearch({ query, vat: effectiveVat, country });
      if (country === "PL") {
        const krs = (response.company?.registry?.id ?? polishResolution?.krs ?? normalized).replace(/\D/g, "");
        if (/^\d{8}$|^\d{10}$/.test(krs)) {
          const officialName = response.company?.name?.trim() || query;
          const page = officialPageFor("PL", krs, officialName);
          if (page) response.officialPage = page;
          await attachPolishFinancialDocuments(response, krs);
        }
        if (polishResolution) {
          response.warnings = [
            polishResolution.detail ?? "Risoluzione KRS effettuata tramite GLEIF",
            ...response.warnings,
          ];
        }
      }
      return prioritizeBalanceDocument(response, normalized || polishResolution?.krs || "");
    } catch (error) {
      console.error("[company-finder] errore orchestratore", error);
      return emptyResponse(
        "Errore interno durante la consultazione delle fonti. Riprova tra qualche istante.",
      );
    }
  });
