import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractGemiFromText,
  isGreekDocumentUrl,
  normalizeGemi,
  normalizeGreekVat,
} from "../src/lib/company-finder/greece";
import { extractGreekDocumentLinks } from "../src/lib/company-finder/greek-filing";
import {
  collectGemiDocuments,
  documentYear,
  mentionsFinancialStatements,
} from "../src/lib/company-finder/sources/gemi-documents";
import { gemiDownloadFileUrl } from "../src/lib/company-finder/sources/gemi-opendata";
import { resolveGreekDocuments } from "../src/lib/company-finder/greek-financials.server";

/**
 * Caso reale di riferimento (verificato sul registro):
 *   ARGI CORPORATION ΜΟΝΟΠΡΟΣΩΠΗ Ι.Κ.Ε. — ΑΦΜ 802575874 — ΓΕΜΗ 178892854000
 *   documento: /api/download/financial/2150556?companyId=178892854000
 */
const REAL_DOCUMENT_URL =
  "https://publicity.businessportal.gr/api/download/financial/2150556?companyId=178892854000";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["GEMI_API_KEY"];
});

describe("ΑΦΜ greco", () => {
  it("valida una partita IVA reale con la cifra di controllo", () => {
    expect(normalizeGreekVat("802575874")).toBe("802575874");
    expect(normalizeGreekVat("EL802575874")).toBe("802575874");
    expect(normalizeGreekVat("el 802.575.874")).toBe("802575874");
  });

  it("rifiuta una partita IVA con cifra di controllo sbagliata", () => {
    expect(normalizeGreekVat("802575875")).toBeUndefined();
    expect(normalizeGreekVat("12345678")).toBeUndefined();
    expect(normalizeGreekVat("")).toBeUndefined();
  });
});

describe("ΓΕΜΗ", () => {
  it("accetta il numero canonico a 12 cifre", () => {
    expect(normalizeGemi("178892854000")).toEqual({
      gemi: "178892854000",
      arGemi: "178892854000",
    });
  });

  it("riporta a 12 cifre la forma compatta a 10 cifre", () => {
    expect(normalizeGemi("1797901000")).toEqual({
      gemi: "1797901000",
      arGemi: "001797901000",
    });
    expect(normalizeGemi("001797901000")).toEqual({
      gemi: "1797901000",
      arGemi: "001797901000",
    });
  });

  it("non scambia un ΑΦΜ a 9 cifre per un ΓΕΜΗ", () => {
    expect(normalizeGemi("802575874")).toBeUndefined();
    expect(normalizeGemi("lettere")).toBeUndefined();
  });

  it("recupera il ΓΕΜΗ dal testo di un documento ufficiale", () => {
    expect(extractGemiFromText("ΑΡΙΘΜΟΣ ΓΕΜΗ:178892854000")?.arGemi).toBe("178892854000");
  });
});

describe("link ai documenti del registro greco", () => {
  it("accetta il link ufficiale di download del bilancio", () => {
    expect(isGreekDocumentUrl(REAL_DOCUMENT_URL)).toBe(true);
    expect(
      isGreekDocumentUrl(
        "https://publicity.businessportal.gr/api/download/Modifications/5787205?companyId=156478806000",
      ),
    ).toBe(true);
  });

  it("rifiuta tutto ciò che non è un documento del registro", () => {
    expect(isGreekDocumentUrl("https://evil.example/api/download/financial/1?companyId=1")).toBe(
      false,
    );
    expect(
      isGreekDocumentUrl("http://publicity.businessportal.gr/api/download/financial/1?companyId=1"),
    ).toBe(false);
    expect(isGreekDocumentUrl("https://publicity.businessportal.gr/company/178892854000")).toBe(
      false,
    );
    expect(isGreekDocumentUrl("non-una-url")).toBe(false);
  });

  it("estrae i link dall'HTML della scheda, anche relativi ed escapati", () => {
    const html = `
      <a href="/api/download/financial/2150556?companyId=178892854000">PDF</a>
      <a href="https://publicity.businessportal.gr/api/download/financial/2150556?companyId=178892854000">doppio</a>
      <a href="https://publicity.businessportal.gr/api/download/Modifications/5787205?companyId=178892854000">atto</a>
      <a href="https://publicity.businessportal.gr/company/178892854000">scheda</a>
    `;
    expect(extractGreekDocumentLinks(html)).toEqual([
      REAL_DOCUMENT_URL,
      "https://publicity.businessportal.gr/api/download/Modifications/5787205?companyId=178892854000",
    ]);
  });

  it("non inventa un link quando la pagina non ne pubblica", () => {
    expect(
      extractGreekDocumentLinks("<html><body>500 Internal Server Error</body></html>"),
    ).toEqual([]);
  });
});

describe("lettura dei documenti dall'API ΓΕΜΗ", () => {
  const payload = {
    decision: [
      {
        kak: "ΚΑΚ-1",
        decisionSubject: "Καταχώριση οικονομικών καταστάσεων χρήσης 2024",
        dateRegistrated: "2025-09-22",
        assemblyDecisionUrl: "/api/download/financial/2150556?companyId=178892854000",
      },
      {
        decisionSubject: "Μεταβολή έδρας",
        dateAnnounced: "2024-02-01",
        elementId: 5787205,
        key: "Modifications",
      },
    ],
  };

  it("riconosce il deposito di bilancio e lo distingue dagli altri atti", () => {
    const documents = collectGemiDocuments(payload);
    expect(documents.length).toBe(2);

    const financial = documents.find((document) => document.financial);
    expect(financial?.url).toBe("/api/download/financial/2150556?companyId=178892854000");
    expect(financial?.label).toContain("οικονομικών καταστάσεων");
    expect(documentYear(financial!)).toBe("2024");

    const other = documents.find((document) => !document.financial);
    expect(other?.elementId).toBe("5787205");
    expect(other?.downloadKey).toBe("Modifications");
  });

  it("classifica dal contesto greco e inglese", () => {
    expect(mentionsFinancialStatements("Οικονομικές Καταστάσεις 2024")).toBe(true);
    expect(mentionsFinancialStatements("financialStatements")).toBe(true);
    expect(mentionsFinancialStatements("Μεταβολή έδρας")).toBe(false);
  });

  it("ordina dal deposito più recente", () => {
    const documents = collectGemiDocuments({
      items: [
        {
          decisionSubject: "οικονομικές καταστάσεις 2022",
          dateRegistrated: "2023-06-01",
          elementId: 1,
          key: "financial",
        },
        {
          decisionSubject: "οικονομικές καταστάσεις 2024",
          dateRegistrated: "2025-09-22",
          elementId: 2,
          key: "financial",
        },
      ],
    });
    const sorted = documents.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    expect(sorted[sorted.length - 1]?.elementId).toBe("2");
  });

  it("costruisce l'URL binario ufficiale solo con un id valido", () => {
    expect(gemiDownloadFileUrl("assemblyDecision", "2150556")).toBe(
      "https://opendata-api.businessportal.gr/api/opendata/v1/downloadFile?key=assemblyDecision&elementId=2150556",
    );
    expect(gemiDownloadFileUrl("assemblyDecision", "abc")).toBe("");
  });
});

describe("risoluzione dei documenti greci", () => {
  it("senza chiave API dichiara il motivo vero e non chiama nessuna fonte", async () => {
    delete process.env["GEMI_API_KEY"];
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGreekDocuments({ vat: "802575874" });
    expect(result.state).toBe("NO_KEY");
    expect(result.detail).toContain("GEMI_API_KEY");
    expect(result.detail).toContain("ΓΕΜΗ");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con la chiave ma senza alcun identificativo chiede il ΓΕΜΗ", async () => {
    process.env["GEMI_API_KEY"] = "chiave-di-prova";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGreekDocuments({});
    expect(result.state).toBe("NO_IDENTIFIER");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con il ΓΕΜΗ e la chiave API restituisce documenti serviti in pagina", async () => {
    process.env["GEMI_API_KEY"] = "chiave-di-prova";

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/companies?")) {
        return jsonResponse({
          searchMetadata: { totalCount: 1 },
          searchResults: [{ arGemi: 178892854000, afm: "802575874", coNameEl: "ARGI CORPORATION" }],
        });
      }
      if (url.endsWith("/documents")) {
        return jsonResponse({
          decision: [
            {
              decisionSubject: "Καταστάσεις οικονομικών χρήσης 2024",
              dateRegistrated: "22/09/2025",
              assemblyDecisionUrl: REAL_DOCUMENT_URL,
            },
          ],
        });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGreekDocuments({ gemi: normalizeGemi("178892854000") });

    expect(result.state).toBe("DOCUMENT_FOUND");
    expect(result.documents.length).toBe(1);

    const document = result.documents[0]!;
    expect(document.sourceUrl).toBe(REAL_DOCUMENT_URL);
    expect(document.viewerUrl.startsWith("/api/company-finder/document?")).toBe(true);
    expect(document.downloadUrl).toContain("disposition=attachment");
    expect(document.year).toBe("2024");
    expect(document.filedAt).toBe("22/09/2025");

    // Nessuna chiave API esce dal server.
    expect(JSON.stringify(result)).not.toContain("chiave-di-prova");
  });

  it("usa il ripiego sulla scheda pubblica quando l'API non elenca documenti", async () => {
    process.env["GEMI_API_KEY"] = "chiave-di-prova";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/companies?")) return jsonResponse({ searchResults: [] });
      if (url.endsWith("/documents")) return jsonResponse({ decision: [] });
      if (url.includes("/company/178892854000")) {
        return new Response(`<a href="${REAL_DOCUMENT_URL}">ΑΡΧΕΙΟ ΟΙΚΟΝ ΚΑΤΑΣΤ 2024.pdf</a>`, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response("", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGreekDocuments({ gemi: normalizeGemi("178892854000") });
    expect(result.state).toBe("DOCUMENT_FOUND");
    expect(result.documents[0]?.sourceUrl).toBe(REAL_DOCUMENT_URL);
  });

  it("dichiara l'assenza della chiave invece di promettere un documento", async () => {
    delete process.env["GEMI_API_KEY"];
    const fetchMock = vi.fn(async () => new Response("500", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGreekDocuments({ gemi: normalizeGemi("178892854000") });
    expect(result.state).toBe("NO_KEY");
    expect(result.detail).toContain("GEMI_API_KEY");
    expect(result.documents).toEqual([]);
  });
});
