import { afterEach, describe, expect, it, vi } from "vitest";

import {
  eeCodeFromInput,
  eeCompanyUrl,
  eeFileUrl,
  eeInternalDocumentUrl,
  fetchEeFileDocument,
  fetchEeFinancials,
  isEeVatLocal,
  parseAutocomplete,
  parseEeAmount,
  parseEeAnnualReport,
  parseEeCompanyPage,
  parseEeFilings,
  parseEeGraphFigures,
  pickEeMatch,
  resetEeFilingCache,
  resolveEeFiling,
} from "../src/lib/company-finder/sources/bilanci/ariregister-ee";
import { isCovered } from "../src/lib/company-finder/coverage";
import { getCountry } from "../src/lib/company-finder/countries";
import { officialPageFor } from "../src/lib/company-finder/official-pages";

/** Risposta reale di /est/api/autocomplete?q=Eskype, ridotta a un hit. */
const AUTOCOMPLETE_ESKYPE = {
  status: "OK",
  data: [
    {
      company_id: 9000156541,
      reg_code: 14035373,
      name: "Eskype Business Logistics OÜ",
      historical_names: [],
      status: "R",
      legal_address: "Harju maakond, Tallinn, Kesklinna linnaosa, Pirita tee 26c/2-30",
      zip_code: "12011",
      legal_form: "5",
      url: "https://ariregister.rik.ee/est/company/14035373/Eskype-Business-Logistics-OÜ",
    },
  ],
};

/**
 * Struttura reale della scheda /eng/company/14035373, ridotta: anagrafica,
 * tabella Annual reports con link PDF/DDOC e tabella Graph view.
 */
const COMPANY_PAGE = `<!DOCTYPE html><html><body>
<h1>Eskype Business Logistics OÜ</h1>
<table><tr><td>Registry code</td><td>14035373</td></tr>
<tr><td>Legal form</td><td>Private limited company</td></tr>
<tr><td>Status</td><td>Entered into the register</td></tr>
<tr><td>Capital is</td><td>2 500 €</td></tr>
<tr><td>Registered</td><td>20.04.2016</td></tr>
<tr><td>Address</td><td>Harju maakond, Tallinn, Pirita tee 26c/2-30, 12011</td></tr>
<tr><td>E-mail address</td><td>ettore.michelin@gmail.com</td></tr>
<tr><td>Mobile phone</td><td>+372 55510362</td></tr></table>
<p>VAT history EE102228900 06.02.2020</p>
<h2>Annual reports</h2>
<table>
<tr><th>Year</th><th>Submitted</th><th>Period</th><th>Status</th><th></th></tr>
<tr><td><a href="#">2025</a></td><td>13.07.2026</td><td>01.01.2025 - 31.12.2025</td><td>Valid</td>
<td><a href="https://ariregister.rik.ee/eng/company/14035373/file/9014440842">PDF</a>,
<a href="https://ariregister.rik.ee/eng/company/14035373/file/9014440842?document_type=ddoc">DDOC</a></td></tr>
<tr><td><a href="#">2024</a></td><td>18.06.2025</td><td>01.01.2024 - 31.12.2024</td><td>Valid</td>
<td><a href="https://ariregister.rik.ee/eng/company/14035373/file/9013028430">PDF</a>,
<a href="https://ariregister.rik.ee/eng/company/14035373/file/9013028430?document_type=ddoc">DDOC</a></td></tr>
</table>
<h2>Graph view</h2>
<table>
<tr><th></th><th>2025</th><th>2024</th></tr>
<tr><td>Revenue</td><td>22 787</td><td>17 032</td></tr>
<tr><td>Profit</td><td>-6 737</td><td>-2 781</td></tr>
<tr><td>Profit margin</td><td>-29.57%</td><td>-16.33%</td></tr>
</table>
</body></html>`;

/** Bilanss + Kasumiaruanne reali del file 9014440842, ridotti alle righe chiave. */
const FILE_PAGE = `<!DOCTYPE html><html><body>
<h2>Bilanss</h2>
<table>
<tr><td>Raha</td><td>25 814</td><td>15 224</td></tr>
<tr><td>Kokku käibevarad</td><td>27 427</td><td>17 012</td></tr>
<tr><td>Kokku varad</td><td>27 427</td><td>17 012</td></tr>
<tr><td>Kokku kohustised</td><td>18 534</td><td>1 382</td></tr>
<tr><td>Kokku omakapital</td><td>8 893</td><td>15 630</td></tr>
</table>
<h2>Kasumiaruanne</h2>
<table>
<tr><td>Müügitulu</td><td>22 787</td><td>17 032</td></tr>
<tr><td>Ärikasum (kahjum)</td><td>-6 762</td><td>-2 842</td></tr>
<tr><td>Aruandeaasta kasum (kahjum)</td><td>-6 737</td><td>-2 781</td></tr>
</table>
</body></html>`;

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetEeFilingCache();
});

describe("Estonia — identificativi e URL", () => {
  it("riconosce il registrikood (8 cifre) e lo distingue dall'IVA (9 cifre)", () => {
    expect(eeCodeFromInput("14035373")).toBe("14035373");
    expect(eeCodeFromInput("EE14035373")).toBe("14035373");
    expect(eeCodeFromInput("102228900")).toBeUndefined();
    expect(isEeVatLocal("102228900")).toBe(true);
    expect(isEeVatLocal("14035373")).toBe(false);
  });

  it("costruisce gli URL pubblici del registro e quello interno TPBox", () => {
    expect(eeCompanyUrl("14035373")).toBe("https://ariregister.rik.ee/eng/company/14035373");
    expect(eeFileUrl("14035373", "9014440842")).toBe(
      "https://ariregister.rik.ee/eng/company/14035373/file/9014440842",
    );
    expect(eeInternalDocumentUrl("14035373", 2025, false)).toBe(
      "/api/company-finder/document?country=EE&company=14035373&year=2025",
    );
    expect(eeInternalDocumentUrl("14035373", 2025, true)).toContain("&download=1");
  });

  it("legge gli importi in formato estone", () => {
    expect(parseEeAmount("25 814")).toBe(25814);
    expect(parseEeAmount("-6 737")).toBe(-6737);
    expect(parseEeAmount("2 500")).toBe(2500);
    expect(parseEeAmount("2 500,50")).toBe(2500.5);
    expect(parseEeAmount("-29.57%")).toBeUndefined();
    expect(parseEeAmount("")).toBeUndefined();
  });
});

describe("Estonia — autocomplete nome → codice", () => {
  it("estrae codice, nome e indirizzo dalla risposta ufficiale", () => {
    const matches = parseAutocomplete(AUTOCOMPLETE_ESKYPE);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ code: "14035373", name: "Eskype Business Logistics OÜ" });
    expect(matches[0]?.address).toContain("Pirita tee");
  });

  it("preferisce la corrispondenza che contiene la query", () => {
    const matches = parseAutocomplete(AUTOCOMPLETE_ESKYPE);
    expect(pickEeMatch(matches, "eskype")?.code).toBe("14035373");
    expect(pickEeMatch(matches, "Eskype Business Logistics OÜ")?.code).toBe("14035373");
    expect(pickEeMatch([], "eskype")).toBeUndefined();
  });
});

describe("Estonia — scheda società e bilanci", () => {
  it("elenca i bilanci depositati con anno, periodo e fileId (niente DDOC)", () => {
    const filings = parseEeFilings(COMPANY_PAGE);
    expect(filings).toHaveLength(2);
    expect(filings[0]).toMatchObject({
      year: 2025,
      submitted: "13.07.2026",
      period: "01.01.2025 - 31.12.2025",
      status: "Valid",
      fileId: "9014440842",
    });
    expect(filings[1]).toMatchObject({ year: 2024, fileId: "9013028430" });
  });

  it("legge ricavi e utili per anno dalla Graph view", () => {
    const figures = parseEeGraphFigures(COMPANY_PAGE);
    expect(figures.get(2025)).toMatchObject({ revenue: 22787, profit: -6737 });
    expect(figures.get(2024)).toMatchObject({ revenue: 17032, profit: -2781 });
  });

  it("estrae l'anagrafica dalla scheda", () => {
    const page = parseEeCompanyPage(COMPANY_PAGE, "14035373");
    expect(page.legalForm).toBe("Private limited company");
    expect(page.status).toBe("Entered into the register");
    expect(page.registeredSince).toBe("20.04.2016");
    expect(page.address).toContain("Pirita tee");
    expect(page.email).toBe("ettore.michelin@gmail.com");
    expect(page.vatNumber).toBe("EE102228900");
    expect(page.filings).toHaveLength(2);
  });

  it("legge Bilanss e Kasumiaruanne dalla pagina del file", () => {
    expect(parseEeAnnualReport(FILE_PAGE)).toMatchObject({
      revenue: 22787,
      netIncome: -6737,
      totalAssets: 27427,
      equity: 8893,
    });
  });

  it("non confonde il CAP con l'EMTAK e legge i campi anche fuori tabella", () => {
    const html = `<!DOCTYPE html><html><body>
<h1>Eskype Business Logistics OÜ (14035373)</h1>
<div><span>Legal form</span><span>Private limited company</span></div>
<div><span>Address</span><span>Pirita tee 26c/2-30</span><span>12011</span></div>
<h2>Areas of activity</h2><p>EMTAK</p><table><tr><td>Business consultancy</td><td>70201</td></tr></table>
</body></html>`;
    const page = parseEeCompanyPage(html, "14035373");
    expect(page.legalForm).toBe("Private limited company");
    expect(page.address).toContain("Pirita tee");
    expect(page.activityCode).toBe("70201");
  });
});

describe("Estonia — ricerca completa e download", () => {
  function stubRegistry() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/est/api/autocomplete")) return jsonResponse(AUTOCOMPLETE_ESKYPE);
        if (String(url).includes("/file/")) return htmlResponse(FILE_PAGE);
        if (String(url).includes("/eng/company/")) return htmlResponse(COMPANY_PAGE);
        throw new Error(`URL inatteso: ${url}`);
      }),
    );
  }

  it("dal nome arriva a scheda, valori e documenti scaricabili interni", async () => {
    stubRegistry();
    const r = await fetchEeFinancials({ query: "Eskype Business Logistics", localVat: "" });
    expect(r.ok).toBe(true);
    expect(r.profile?.name).toContain("Eskype");
    expect(r.profile?.registry?.id).toBe("Registrikood 14035373");
    expect(r.financials?.available).toBe(true);
    expect(r.financials?.years).toHaveLength(2);
    expect(r.financials?.years[0]).toMatchObject({
      year: 2025,
      revenue: 22787,
      netIncome: -6737,
      totalAssets: 27427,
      equity: 8893,
      currency: "EUR",
    });
    expect(r.financials?.documentUrl).toBe(
      "/api/company-finder/document?country=EE&company=14035373&year=2025",
    );
    expect(r.financials?.availability).toBe("DOCUMENT_DOWNLOADABLE");
    expect(r.financials?.documents).toHaveLength(2);
    expect(r.financials?.documents?.[0]?.downloadUrl).toContain("country=EE");
    // Nessun URL del registro lascia il server: solo endpoint interni.
    expect(r.financials?.documentUrl).not.toContain("ariregister");
    expect(r.financials?.documents?.[0]?.downloadUrl).not.toContain("ariregister");
  });

  it("dal registrikood non chiama l'autocomplete", async () => {
    const spy = vi.fn(async (url: string) => {
      if (String(url).includes("/file/")) return htmlResponse(FILE_PAGE);
      return htmlResponse(COMPANY_PAGE);
    });
    vi.stubGlobal("fetch", spy);
    const r = await fetchEeFinancials({ query: "", localVat: "14035373" });
    expect(r.ok).toBe(true);
    expect(spy.mock.calls.some(([url]) => String(url).includes("autocomplete"))).toBe(false);
  });

  it("risolve anno → fileId per l'endpoint di download", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => htmlResponse(COMPANY_PAGE)),
    );
    expect(await resolveEeFiling("14035373", 2024)).toMatchObject({
      ok: true,
      fileId: "9013028430",
    });
    const missing = await resolveEeFiling("14035373", 2010);
    expect(missing.ok).toBe(false);
    expect(missing.error).toContain("2010");
  });

  it("serve il PDF quando il registro lo negozia, altrimenti l'HTML ufficiale", async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(pdf, { status: 200, headers: { "Content-Type": "application/pdf" } }),
      ),
    );
    const asPdf = await fetchEeFileDocument("14035373", "9014440842");
    expect(asPdf.ok).toBe(true);
    expect(asPdf.contentType).toBe("application/pdf");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => htmlResponse(FILE_PAGE)),
    );
    const asHtml = await fetchEeFileDocument("14035373", "9014440842");
    expect(asHtml.ok).toBe(true);
    expect(asHtml.contentType).toBe("text/html; charset=utf-8");
  });
});

describe("Estonia — copertura e destinazione documentale", () => {
  it("è un paese automatico con fonte gratuita dichiarata", () => {
    expect(isCovered("EE")).toBe(true);
    expect(getCountry("EE")?.financials.free).toBe(true);
  });

  it("la pagina ufficiale punta alla scheda della società, non alla home", () => {
    const page = officialPageFor("EE", "14035373", "");
    expect(page?.url).toBe("https://ariregister.rik.ee/eng/company/14035373");
    expect(page?.note.length ?? 0).toBeGreaterThan(30);
    expect(officialPageFor("EE", "", "")?.url).toBe("https://ariregister.rik.ee/eng");
  });
});
