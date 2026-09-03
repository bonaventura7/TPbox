import { afterEach, describe, expect, it, vi } from "vitest";

import { applyGreekDocuments } from "../src/lib/company-finder/greek-financials.server";
import { getCountry } from "../src/lib/company-finder/countries";
import type { SearchResponse } from "../src/lib/company-finder/types";

/**
 * Il flusso completo che l'utente vede per una società greca: la stessa
 * funzione che la server function `findCompany` chiama prima di rispondere.
 * Caso reale: ARGI CORPORATION ΜΟΝΟΠΡΟΣΩΠΗ Ι.Κ.Ε., ΑΦΜ 802575874,
 * ΓΕΜΗ 178892854000, bilancio 2024 depositato il 22/09/2025.
 */
const REAL_DOCUMENT_URL =
  "https://publicity.businessportal.gr/api/download/financial/2150556?companyId=178892854000";

function greekResponse(vat: string, name: string): SearchResponse {
  const country = getCountry("GR")!;
  return {
    found: true,
    company: { name, country, registry: { name: "ΓΕΜΗ", authority: "ΚΕΕΕ", id: vat } },
    financials: { available: false, years: [] },
    sources: [],
    warnings: [],
    searchedAt: new Date().toISOString(),
    officialPage: {
      url: `https://publicity.businessportal.gr/company/${vat}`,
      label: "ΓΕΜΗ — Publicity",
      note: "consultazione",
    },
  };
}

function stubGemiApi(documentsPayload: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/companies?")) {
      return new Response(
        JSON.stringify({
          searchResults: [
            {
              arGemi: 178892854000,
              afm: "802575874",
              coNameEl: "ARGI CORPORATION ΜΟΝΟΠΡΟΣΩΠΗ Ι.Κ.Ε.",
              legalType: { descr: "Ι.Κ.Ε." },
              status: { descr: "Ενεργή", isActive: true },
              street: "ΜΥΛΩΝ",
              streetNumber: "14",
              zipCode: "35100",
              city: "ΛΑΜΙΑ",
              incorporationDate: "2024-08-26",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.endsWith("/documents")) {
      return new Response(JSON.stringify(documentsPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["GEMI_API_KEY"];
});

describe("flusso Grecia: dalla ricerca al documento in pagina", () => {
  it("ΓΕΜΗ a 12 cifre → identità dal registro e bilancio scaricabile con un clic", async () => {
    process.env["GEMI_API_KEY"] = "chiave-di-prova";
    stubGemiApi({
      decision: [
        {
          decisionSubject: "Καταχώριση οικονομικών καταστάσεων χρήσης 2024",
          dateRegistrated: "22/09/2025",
          assemblyDecisionUrl: REAL_DOCUMENT_URL,
        },
      ],
    });

    const result = await applyGreekDocuments(
      greekResponse("178892854000", "ARGI CORPORATION"),
      "178892854000",
      "",
    );

    // Identità arricchita dal registro ufficiale.
    expect(result.company?.registry?.id).toBe("178892854000");
    expect(result.company?.legalForm).toBe("Ι.Κ.Ε.");
    expect(result.company?.status).toBe("Ενεργή");
    expect(result.company?.registeredSince).toBe("2024-08-26");
    expect(result.company?.address).toContain("ΛΑΜΙΑ");

    // Documento: due URL, entrambi stessa origine.
    const documents = result.financials?.documents ?? [];
    expect(documents.length).toBe(1);
    expect(documents[0]?.viewerUrl.startsWith("/api/company-finder/document?")).toBe(true);
    expect(documents[0]?.downloadUrl).toContain("disposition=attachment");
    expect(documents[0]?.year).toBe("2024");
    expect(documents[0]?.filedAt).toBe("22/09/2025");
    expect(result.financials?.documentUrl?.startsWith("/api/company-finder/document?")).toBe(true);

    // Nessuna fonte terza proposta all'utente.
    expect(result.officialPage).toBeUndefined();
    // Nessuna chiave API nel payload che arriva al browser.
    expect(JSON.stringify(result)).not.toContain("chiave-di-prova");
  });

  it("il link incollato dall'utente diventa un documento in pagina", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await applyGreekDocuments(
      greekResponse("178892854000", "ARGI CORPORATION"),
      "178892854000",
      REAL_DOCUMENT_URL,
    );

    expect(result.financials?.documents?.length).toBe(1);
    expect(result.financials?.documents?.[0]?.downloadUrl).toContain("disposition=attachment");
    expect(result.officialPage).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rifiuta un link che non appartiene al registro", async () => {
    delete process.env["GEMI_API_KEY"];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("500", { status: 500 })),
    );

    const result = await applyGreekDocuments(
      greekResponse("178892854000", "ARGI CORPORATION"),
      "178892854000",
      "https://evil.example/bilancio.pdf",
    );

    expect(result.financials?.documents).toBeUndefined();
    expect(result.financials?.documentUrl).toBeUndefined();
    expect(result.financials?.restriction).toBe("NO_KEY");
  });

  it("senza chiave API dice cosa manca invece di mostrare un riquadro vuoto", async () => {
    delete process.env["GEMI_API_KEY"];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("500", { status: 500 })),
    );

    const result = await applyGreekDocuments(
      greekResponse("802575874", "ARGI CORPORATION"),
      "802575874",
      "",
    );

    expect(result.financials?.documents).toBeUndefined();
    expect(result.financials?.restriction).toBe("NO_KEY");
    expect(result.financials?.note).toContain("GEMI_API_KEY");
  });

  it("non tocca le risposte degli altri paesi", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const country = getCountry("DE")!;
    const response: SearchResponse = {
      found: true,
      company: { name: "Siemens AG", country },
      financials: {
        available: true,
        years: [],
        documentUrl: "https://www.unternehmensregister.de/x.pdf",
      },
      sources: [],
      warnings: [],
      searchedAt: new Date().toISOString(),
    };

    const result = await applyGreekDocuments(response, "", "");
    expect(result).toBe(response);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
