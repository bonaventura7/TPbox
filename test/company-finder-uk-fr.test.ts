import { afterEach, describe, expect, it, vi } from "vitest";

import {
  lookupUkPublic,
  ukNumberFromInput,
} from "../src/lib/company-finder/sources/bilanci/companies-house-public";
import {
  searchRechercheEntreprises,
  sirenFromInput,
} from "../src/lib/company-finder/sources/recherche-entreprises-fr";

const SEARCH_HTML = `
<ul id="results">
  <li><h3><a href="/company/07524813">ROLLS-ROYCE HOLDINGS PLC</a></h3></li>
  <li><h3><a href="/company/16318460">AAAC HOLDINGS LIMITED</a></h3></li>
</ul>`;

const COMPANY_HTML = `
<h1 class="heading-xlarge">ROLLS-ROYCE HOLDINGS PLC</h1>
<dd id="company-status">Active</dd>
<dd id="company-type">Public limited Company</dd>
<dd id="reg-address-value">Kings Place, 90 York Way, London, N1 9FX</dd>
<dd id="company-creation-date">17 February 2011</dd>`;

const FILING_HTML = `
<table><tbody>
<tr><td>19 May 2026</td><td>SH06 Cancellation of shares</td>
  <td><a href="/company/07524813/filing-history/AAA/document?format=pdf&amp;download=0">View PDF</a></td></tr>
<tr><td>3 March 2026</td><td>Group of companies' accounts made up to 31 December 2025</td>
  <td><a href="/company/07524813/filing-history/MzUzMzQx/document?format=pdf&amp;download=0">View PDF</a></td></tr>
</tbody></table>`;

const FR_JSON = {
  results: [
    {
      siren: "393602685",
      nom_complet: "TOD'S FRANCE",
      etat_administratif: "A",
      date_creation: "1993-12-15",
      activite_principale: "47.72A",
      siege: { adresse: "22 RUE DU GENERAL FOY 75008 PARIS", siret: "39360268500223" },
      dirigeants: [{ nom: "RIVABENE", prenoms: "LORENZA", qualite: "Président de SAS" }],
      finances: { "2024": { ca: 29562056, resultat_net: 457326 }, "2023": { ca: 27000000 } },
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("Companies House — sito pubblico, senza chiave", () => {
  it("riconosce i numeri societari inglesi e scozzesi", () => {
    expect(ukNumberFromInput("07524813")).toBe("07524813");
    expect(ukNumberFromInput("SC866048")).toBe("SC866048");
    expect(ukNumberFromInput("Rolls-Royce")).toBeUndefined();
  });

  it("dal nome arriva al documento dei conti annuali", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = url.includes("/search/companies")
          ? SEARCH_HTML
          : url.includes("filing-history")
            ? FILING_HTML
            : COMPANY_HTML;
        return { ok: true, status: 200, text: async () => body } as unknown as Response;
      }),
    );
    const r = await lookupUkPublic("Rolls-Royce Holdings plc", "");
    expect(r.ok).toBe(true);
    expect(r.profile?.name).toBe("ROLLS-ROYCE HOLDINGS PLC");
    expect(r.profile?.registry?.id).toBe("Company No. 07524813");
    expect(r.profile?.status).toBe("active");
    // Deve saltare la riga SH06 e prendere quella dei conti annuali.
    expect(r.financials?.documentTitle).toContain("accounts");
    expect(r.financials?.documentUrl).toContain(encodeURIComponent("MzUzMzQx"));
    expect(r.financials?.available).toBe(true);
  });

  it("dichiara l'assenza di depositi invece di inventarli", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = url.includes("/search/companies")
          ? SEARCH_HTML
          : url.includes("filing-history")
            ? "<table></table>"
            : COMPANY_HTML;
        return { ok: true, status: 200, text: async () => body } as unknown as Response;
      }),
    );
    const r = await lookupUkPublic("Rolls-Royce Holdings plc", "");
    expect(r.ok).toBe(true);
    expect(r.financials?.available).toBe(false);
    expect(r.financials?.note).toContain("Nessun deposito");
  });
});

describe("Recherche d'entreprises — fonte pubblica francese", () => {
  it("ricava il SIREN dalle 9 cifre e dall'IVA francese", () => {
    expect(sirenFromInput("393602685")).toBe("393602685");
    expect(sirenFromInput("FR12393602685")).toBe("393602685");
    expect(sirenFromInput("12")).toBeUndefined();
  });

  it("mappa scheda e conti in ordine di esercizio decrescente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => ({ ok: true, status: 200, json: async () => FR_JSON }) as unknown as Response,
      ),
    );
    const r = await searchRechercheEntreprises("TOD'S France", "");
    expect(r.ok).toBe(true);
    expect(r.profile?.registry?.id).toBe("SIREN 393602685");
    expect(r.profile?.status).toBe("attiva");
    expect(r.profile?.officers?.[0]?.name).toBe("LORENZA RIVABENE");
    expect(r.financials?.years[0]?.periodLabel).toBe("Esercizio 2024");
    expect(r.financials?.years[0]?.revenue).toBe(29562056);
    expect(r.financials?.years[0]?.netIncome).toBe(457326);
    // L'esercizio 2023 ha solo il fatturato: il campo mancante resta assente,
    // non diventa zero.
    expect(r.financials?.years[1]?.netIncome).toBeUndefined();
  });
});
