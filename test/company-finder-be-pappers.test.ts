import { afterEach, describe, expect, it, vi } from "vitest";

import { attachOfficialDocument } from "../src/lib/company-finder/orchestrator";
import { AUTO_ISOS, isCovered } from "../src/lib/company-finder/coverage";
import { officialPageFor } from "../src/lib/company-finder/official-pages";
import {
  buildBeProfile,
  cbeFromBeInput,
  fetchBePappers,
  pappersBeCompanyUrl,
  pappersBeSlugs,
  parseBeAmount,
  parseBeExactRevenue,
  parseBeFilings,
  parseBeFinanceHtml,
  parseBeFinanceMarkdown,
  parseBePdfAnchors,
} from "../src/lib/company-finder/sources/bilanci/pappers-public-be.server";

/**
 * Belgio — Pappers.be, pagina pubblica gratuita (senza chiave).
 * Fixture modellate sui dati reali osservati il 09/09/2026 per BEAULIEU
 * International Group (CBE 0442824497): tabella Finances, intestazioni con
 * ricavi esatti, anagrafica BCE ed elenco Comptes annuels.
 */

const CBE = "0442824497";

const HTML_FIXTURE = `<!doctype html><html><body>
<h1>BEAULIEU INTERNATIONAL GROUP</h1>
<div>Active • 0442.824.497</div>
<div>Chiffre d'affaires 2025</div><div>34 370 497,51 €</div>
<div>Chiffre d'affaires 2024</div><div>36 034 540,77 €</div>
<div>Numéro</div><div>0442.824.497</div>
<div>Forme juridique</div><div>Société anonyme (SA)</div>
<div>Numéro de TVA</div><div>VALIDE • BE0442824497</div>
<div>Numéro EUID</div><div>BEKBOBCE.0442.824.497</div>
<div>Situation juridique</div><div>Normal situation • Depuis le 21/12/1990</div>
<div>Capital social</div><div>227 000 000,00 €</div>
<div>Adresse</div><div>16 Kalkhoevestraat Box 0.1, 8790 Waregem</div>
<div>Création</div><div>21/12/1990</div>
<div>Code NACEBEL</div><div>63.100 • Infrastructure informatique</div>
<div>Dernière mise à jour BCE : 08/09/2026</div>
<table>
<tr><th>Performance</th><th></th><th>2025</th><th>2024</th></tr>
<tr><td>Chiffre d'affaires</td><td>€</td><td>34,4 M</td><td>36 M</td></tr>
<tr><td>Résultat net</td><td>€</td><td>182 M</td><td>75 M</td></tr>
<tr><td>Fonds propres</td><td>€</td><td>585 M</td><td>587 M</td></tr>
<tr><td>Taux de croissance du CA</td><td>%</td><td>22,7</td><td>-11,7</td></tr>
</table>
<h2>Comptes annuels</h2>
<div>Comptes sociaux 2025</div><div>23/06/2026</div>
<div>Comptes consolidés 2024</div><div>30/05/2025</div>
</body></html>`;

// Il pattern reale delle ancore PDF di Pappers.be non è osservabile
// dall'ambiente di test: qui si verifica il meccanismo (ancora .pdf sullo
// stesso host → download interno), non lo schema dell'URL.
const HTML_WITH_PDF = HTML_FIXTURE.replace(
  "</body>",
  `<a data-year="2025" href="/fr/company/beaulieu-international-group-0442824497/documents/comptes-2025.pdf">Télécharger le fichier PDF</a>
</body>`,
);

const MARKDOWN_FIXTURE = `# BEAULIEU INTERNATIONAL GROUP

Numéro

0442.824.497

Chiffre d'affaires 2025

34 370 497,51 €

| Performance |  | 2025 | 2024 |
| --- | --- | --- | --- |
| Chiffre d'affaires | € | 34,4 M | 36 M |
| Résultat net | € | 182 M | 75 M |
| Fonds propres | € | 585 M | 587 M |

##### Comptes sociaux 2025

###### 23/06/2026
`;

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Belgio — URL e importi Pappers.be", () => {
  it("costruisce slug e URL della scheda dal nome e dal CBE", () => {
    expect(pappersBeSlugs("BEAULIEU International Group")).toEqual([
      "beaulieu-international-group",
      "entreprise",
    ]);
    expect(pappersBeSlugs("")).toEqual(["entreprise"]);
    expect(pappersBeCompanyUrl("beaulieu-international-group", CBE)).toBe(
      `https://www.pappers.be/fr/company/beaulieu-international-group-${CBE}`,
    );
  });

  it("accetta solo il CBE a 10 cifre", () => {
    expect(cbeFromBeInput("0442824497")).toBe(CBE);
    expect(cbeFromBeInput("BE0442824497")).toBe(CBE);
    expect(cbeFromBeInput("123")).toBeUndefined();
  });

  it("interpreta milioni, decimali francesi ed euro esatti", () => {
    expect(parseBeAmount("34,4 M")).toBe(34_400_000);
    expect(parseBeAmount("36 M")).toBe(36_000_000);
    expect(parseBeAmount("-4,62")).toBe(-4.62);
    expect(parseBeAmount("0")).toBe(0);
    expect(parseBeAmount("34 370 497,51 €")).toBe(34_370_497.51);
    expect(parseBeAmount("227 000 000,00 €")).toBe(227_000_000);
    expect(parseBeAmount("—")).toBeUndefined();
    expect(parseBeAmount("n.d.")).toBeUndefined();
  });
});

describe("Belgio — tabella Finances e ricavi esatti", () => {
  it("legge valori e anni dalla tabella HTML, saltando le righe in %", () => {
    const values = parseBeFinanceHtml(HTML_FIXTURE);
    expect(values.get(2025)).toMatchObject({
      revenue: 34_400_000,
      netIncome: 182_000_000,
      equity: 585_000_000,
    });
    expect(values.get(2024)?.netIncome).toBe(75_000_000);
    expect(values.has(2023)).toBe(false);
  });

  it("legge la stessa tabella dal markdown del reader", () => {
    const values = parseBeFinanceMarkdown(MARKDOWN_FIXTURE);
    expect(values.get(2025)).toMatchObject({ revenue: 34_400_000, equity: 585_000_000 });
  });

  it("preferisce i ricavi esatti dell'intestazione agli arrotondamenti", () => {
    const exact = parseBeExactRevenue("Chiffre d'affaires 2025\n\n34 370 497,51 €");
    expect(exact.get(2025)).toBe(34_370_497.51);
  });
});

describe("Belgio — anagrafica ed elenco conti", () => {
  it("estrae la scheda BCE e rifiuta la pagina di un'altra società", () => {
    const profile = buildBeProfile(HTML_FIXTURE, CBE, false);
    expect(profile?.name).toBe("BEAULIEU INTERNATIONAL GROUP");
    expect(profile?.address).toBe("16 Kalkhoevestraat Box 0.1, 8790 Waregem");
    expect(profile?.legalForm).toBe("Société anonyme (SA)");
    expect(profile?.status).toBe("Normal situation");
    expect(profile?.registeredSince).toBe("21/12/1990");
    expect(profile?.capital).toBe("227 000 000,00 €");
    expect(profile?.activityCodes).toEqual([{ code: "63.100" }]);
    expect(profile?.registry?.id).toBe("BCE 0442.824.497");
    expect(profile?.identifiers).toContainEqual({ key: "IVA", value: "BE0442824497" });

    // Fail-closed: CBE diverso → nessuna scheda (mai dati altrui).
    expect(buildBeProfile(HTML_FIXTURE, "0403101811", false)).toBeUndefined();
  });

  it("elenca i conti depositati con anno e data", () => {
    const filings = parseBeFilings("Comptes sociaux 2025\n23/06/2026\nComptes sociaux 2024\n");
    expect(filings.map((f) => f.year)).toEqual([2025, 2024]);
    expect(filings[0]?.deposited).toBe("23/06/2026");
    expect(filings[0]?.title).toContain("Comptes sociaux 2025");
  });

  it("aggancia le ancore PDF all'esercizio quando il markup le espone", () => {
    const pdfs = parseBePdfAnchors(HTML_WITH_PDF, pappersBeCompanyUrl("x", CBE));
    expect(pdfs.get(2025)).toContain("www.pappers.be");
    expect(pdfs.get(2025)).toContain(".pdf");
  });
});

describe("Belgio — fetch combinato scheda + bilanci", () => {
  it("senza CBE dichiara lo skipped senza toccare la rete", async () => {
    const fetchMock = vi.fn(async () => htmlResponse(""));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchBePappers({ query: "Beaulieu", localVat: "" });
    expect(r.ok).toBe(false);
    expect(r.skipped).toMatch(/CBE/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restituisce profilo, valori ed elenco conti senza alcuna chiave", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => htmlResponse(HTML_FIXTURE)),
    );
    const r = await fetchBePappers({ query: "BEAULIEU International Group", localVat: CBE });
    expect(r.ok).toBe(true);
    expect(r.profile?.name).toBe("BEAULIEU INTERNATIONAL GROUP");
    const fin = r.financials!;
    expect(fin.available).toBe(true);
    expect(fin.currency).toBe("EUR");
    expect(fin.years.map((y) => y.year)).toEqual([2025, 2024]);
    // Ricavo esatto dell'intestazione, non l'arrotondamento della tabella.
    expect(fin.years[0]?.revenue).toBe(34_370_497.51);
    expect(fin.years[0]?.netIncome).toBe(182_000_000);
    expect(fin.years[0]?.equity).toBe(585_000_000);
    expect(fin.documents?.map((d) => d.year)).toEqual([2025, 2024]);
    // Senza ancore PDF: riferimento noto, nessun link inventato.
    expect(fin.availability).toBe("DOCUMENT_FOUND");
    expect(fin.documentUrl).toBeUndefined();
    expect(fin.documents?.[0]?.downloadUrl).toBeUndefined();
    expect(fin.note).toMatch(/Pappers\.be/);
  });

  it("serve i PDF in pagina quando le ancore sono nel markup", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => htmlResponse(HTML_WITH_PDF)),
    );
    const r = await fetchBePappers({ query: "", localVat: CBE });
    const fin = r.financials!;
    expect(fin.availability).toBe("DOCUMENT_DOWNLOADABLE");
    expect(fin.documentUrl).toMatch(/^\/api\/company-finder\/document\?url=/);
    expect(fin.documentUrl).toContain("www.pappers.be");
    expect(fin.documentUrl).toBe(fin.documents?.[0]?.downloadUrl);
  });

  it("su 403 ripiega sul reader e legge comunque valori e conti", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(htmlResponse("forbidden", 403))
      .mockResolvedValueOnce(
        new Response(MARKDOWN_FIXTURE, {
          status: 200,
          headers: { "content-type": "text/markdown; charset=utf-8" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchBePappers({ query: "", localVat: CBE });
    expect(r.ok).toBe(true);
    expect(r.financials?.years[0]?.revenue).toBe(34_370_497.51);
    expect(r.financials?.documents?.[0]?.year).toBe(2025);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("su 404 pulito non ritenta il reader e dichiara l'assenza", async () => {
    const fetchMock = vi.fn(async () => htmlResponse("not found", 404));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchBePappers({ query: "Beaulieu", localVat: CBE });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/nessuna scheda/);
    // Due slug diretti, nessun passaggio dal reader.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("www.pappers.be");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("www.pappers.be");
  });
});

describe("Belgio — merge valori + documento ufficiale", () => {
  const years = [{ periodLabel: "Esercizio 2025", year: 2025, revenue: 10, currency: "EUR" }];

  it("allega il PDF NBB ai valori Pappers.be", () => {
    const merged = attachOfficialDocument([
      { available: true, years, currency: "EUR", note: "valori", availability: "DOCUMENT_FOUND" },
      {
        available: true,
        years: [],
        documentUrl: "/api/company-finder/document?url=https%3A%2F%2Fws.cbso.nbb.be%2Fx",
        documentTitle: "Conti annuali pubblicati (CBE 0442824497)",
      },
    ]);
    expect(merged?.years).toEqual(years);
    expect(merged?.documentUrl).toContain("ws.cbso.nbb.be");
    expect(merged?.documentTitle).toContain("CBE 0442824497");
    expect(merged?.note).toBe("valori");
  });

  it("non tocca chi ha già il documento e gestisce i casi vuoti", () => {
    const winner = { available: true, years, documentUrl: "/api/x" };
    expect(attachOfficialDocument([winner])).toBe(winner);
    expect(
      attachOfficialDocument([{ available: true, years, currency: "EUR" }])?.documentUrl,
    ).toBeUndefined();
    expect(attachOfficialDocument([])).toBeUndefined();
  });
});

describe("Belgio — copertura automatica con fallback NBB", () => {
  it("è automatico (valori senza chiave) ma conserva la pagina NBB", () => {
    expect((AUTO_ISOS as readonly string[]).includes("BE")).toBe(true);
    expect(isCovered("BE")).toBe(true);
    const page = officialPageFor("BE", "0442824497", "");
    expect(page?.url).toBe("https://consult.cbso.nbb.be/consult-enterprise/0442824497");
  });
});
