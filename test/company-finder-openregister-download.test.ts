import { describe, expect, it } from "vitest";

import { buildOpenRegisterFinancialCsv } from "../src/lib/company-finder/sources/bilanci/openregister-de";

describe("OpenRegister German financial download", () => {
  it("flattens Aktiva, Passiva and GuV rows into a downloadable CSV", () => {
    const csv = buildOpenRegisterFinancialCsv(
      {
        report_id: "r-2024",
        report_start_date: "2024-01-01",
        report_end_date: "2024-12-31",
        aktiva: {
          rows: [
            {
              name: "Anlagevermögen",
              formatted_name: "Anlagevermögen",
              current_value: 1000,
              previous_value: 900,
              children: [
                {
                  name: "Sachanlagen",
                  formatted_name: "Sachanlagen",
                  current_value: 700,
                  previous_value: 650,
                  children: [],
                },
              ],
            },
          ],
        },
        passiva: {
          rows: [
            {
              name: "Eigenkapital",
              formatted_name: "Eigenkapital",
              current_value: 600,
              previous_value: 500,
              children: [],
            },
          ],
        },
        guv: {
          rows: [
            {
              name: "Umsatzerlöse",
              formatted_name: "Umsatzerlöse",
              current_value: 2500,
              previous_value: 2200,
              children: [],
            },
          ],
        },
      },
      "ORI MARTIN Deutschland GmbH",
    );

    expect(csv).toContain("Sektion;Position;Aktueller Wert;Vorjahreswert");
    expect(csv).toContain("Aktiva;Anlagevermögen;1000;900");
    expect(csv).toContain("Aktiva;Anlagevermögen > Sachanlagen;700;650");
    expect(csv).toContain("Passiva;Eigenkapital;600;500");
    expect(csv).toContain("GuV;Umsatzerlöse;2500;2200");
  });
});
