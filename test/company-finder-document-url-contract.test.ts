import { afterEach, describe, expect, it, vi } from "vitest";

import { lookupUkPublic } from "../src/lib/company-finder/sources/bilanci/companies-house-public";

const SEARCH_HTML = `
<ul id="results">
  <li><h3><a href="/company/07524813">ROLLS-ROYCE HOLDINGS PLC</a></h3></li>
</ul>`;

const COMPANY_HTML = `
<h1 class="heading-xlarge">ROLLS-ROYCE HOLDINGS PLC</h1>
<dd id="company-status">Active</dd>`;

const FILING_HTML = `
<table><tbody>
<tr><td>18 May 2026</td><td>Group of companies' accounts made up to 31 December 2025</td>
  <td><a href="/company/07524813/filing-history/MzUzMzQx/document?format=pdf&amp;download=0">View PDF</a></td></tr>
</tbody></table>`;

function stubFetch(): void {
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
}

afterEach(() => vi.unstubAllGlobals());

describe("contratto documentUrl — l'adapter restituisce l'URL ufficiale, non un URL già proxato", () => {
  it("documentUrl è l'URL esterno di Companies House", async () => {
    stubFetch();
    const r = await lookupUkPublic("Rolls-Royce Holdings plc", "");
    expect(r.financials?.documentUrl).toBe(
      "https://find-and-update.company-information.service.gov.uk/company/07524813/filing-history/MzUzMzQx/document?format=pdf&download=0",
    );
  });

  it("documentUrl non passa dal proxy interno: l'incapsulamento spetta a prioritizeBalanceDocument()", async () => {
    stubFetch();
    const r = await lookupUkPublic("Rolls-Royce Holdings plc", "");
    const url = r.financials?.documentUrl ?? "";
    expect(url.startsWith("/api/company-finder/document")).toBe(false);
    expect(url).not.toContain("url=");
  });
});
