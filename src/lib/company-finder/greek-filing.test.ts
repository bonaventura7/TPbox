import { describe, expect, it } from "vitest";

import { extractGreekFilingUrl } from "./greek-filing";

describe("extractGreekFilingUrl", () => {
  it("selects the direct iXBRL filing URL instead of the public company page", () => {
    const html = `
      <a href="https://publicity.businessportal.gr/company/1234567890">Company</a>
      <a href="https://filings.businessportal.gr/ixbrl/2ea7af41-55f8-401a-9f9e-e1ee7f0c0d66_ixbrlview.html">Annual accounts 2025</a>
    `;

    expect(extractGreekFilingUrl(html)).toBe(
      "https://filings.businessportal.gr/ixbrl/2ea7af41-55f8-401a-9f9e-e1ee7f0c0d66_ixbrlview.html",
    );
  });

  it("returns undefined when no Greek iXBRL filing is present", () => {
    expect(
      extractGreekFilingUrl('<a href="https://publicity.businessportal.gr/company/1234567890">Company</a>'),
    ).toBeUndefined();
  });
});
