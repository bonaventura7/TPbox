// Fixture presa dal payload REALE di api-krs.ms.gov.pl il 10.09.2026:
// AVIO POLSKA sp. z o.o., KRS 0000002594, odpis aktualny, Dział 3.
// 26 wzmianki di bilancio (con un duplicato FY2017) e 22 opinioni del revisore.
// Se il Ministero rinomina i campi, cade questo test prima del tool.
import { describe, expect, it } from "vitest";
import {
  buildKrsFilingsFinancials,
  krsFiscalYear,
  parseKrsFilings,
} from "../src/lib/company-finder/sources/bilanci/poland-krs-filings";

const odpisReale = {
  odpis: {
    dane: {
      dzial3: {
        wzmiankiOZlozonychDokumentach: {
          wzmiankaOZlozeniuRocznegoSprawozdaniaFinansowego: [
            { dataZlozenia: "26.04.2002", zaOkresOdDo: "ROK OBROTOWY 2001" },
            { dataZlozenia: "01.04.2003", zaOkresOdDo: "ROK OBROTOWY 2002" },
            { dataZlozenia: "24.03.2004", zaOkresOdDo: "ROK OBROTOWY 2003" },
            { dataZlozenia: "21.04.2005", zaOkresOdDo: "ROK OBROTOWY 2004" },
            { dataZlozenia: "25.04.2006", zaOkresOdDo: "ROK OBROTOWY 2005" },
            { dataZlozenia: "02.05.2007", zaOkresOdDo: "ROK OBROTOWY 2006" },
            { dataZlozenia: "09.04.2008", zaOkresOdDo: "2007 ROK" },
            { dataZlozenia: "11.05.2009", zaOkresOdDo: "ROK OBROTOWY 2008" },
            { dataZlozenia: "05.05.2010", zaOkresOdDo: "2009 ROK" },
            { dataZlozenia: "02.06.2011", zaOkresOdDo: "2010 ROK" },
            { dataZlozenia: "12.04.2012", zaOkresOdDo: "2011 ROK" },
            { dataZlozenia: "30.04.2013", zaOkresOdDo: "2012 ROK" },
            { dataZlozenia: "06.05.2014", zaOkresOdDo: "OD 01.01.2013 DO 31.12.2013" },
            { dataZlozenia: "04.05.2015", zaOkresOdDo: "OD 01.01.2014 DO 31.12.2014" },
            { dataZlozenia: "10.05.2016", zaOkresOdDo: "OD 01.01.2015 DO 31.12.2015" },
            { dataZlozenia: "19.05.2017", zaOkresOdDo: "OD 01.01.2016 DO 31.12.2016" },
            { dataZlozenia: "14.07.2018", zaOkresOdDo: "OD 01.01.2017 DO 31.12.2017" },
            { dataZlozenia: "14.07.2018", zaOkresOdDo: "OD 01.01.2017 DO 31.12.2017" },
            { dataZlozenia: "25.04.2019", zaOkresOdDo: "OD 01.01.2018 DO 31.12.2018" },
            { dataZlozenia: "30.06.2020", zaOkresOdDo: "OD 01.01.2019 DO 31.12.2019" },
            { dataZlozenia: "01.06.2021", zaOkresOdDo: "OD 01.01.2020 DO 31.12.2020" },
            { dataZlozenia: "13.05.2022", zaOkresOdDo: "OD 01.01.2021 DO 31.12.2021" },
            { dataZlozenia: "29.05.2023", zaOkresOdDo: "OD 01.01.2022 DO 31.12.2022" },
            { dataZlozenia: "09.05.2024", zaOkresOdDo: "OD 01.01.2023 DO 31.12.2023" },
            { dataZlozenia: "13.05.2025", zaOkresOdDo: "OD 01.01.2024 DO 31.12.2024" },
            { dataZlozenia: "11.06.2026", zaOkresOdDo: "OD 01.01.2025 DO 31.12.2025" },
          ],
          wzmiankaOZlozeniuOpiniiBieglegoRewidentaSprawozdaniaZBadania: [
            { zaOkresOdDo: "ROK OBROTOWY 2004" },
            { zaOkresOdDo: "ROK OBROTOWY 2005" },
            { zaOkresOdDo: "ROK OBROTOWY 2006" },
            { zaOkresOdDo: "2007 ROK" },
            { zaOkresOdDo: "ROK OBROTOWY 2008" },
            { zaOkresOdDo: "2009 ROK" },
            { zaOkresOdDo: "2010 ROK" },
            { zaOkresOdDo: "2011 ROK" },
            { zaOkresOdDo: "2012 ROK" },
            { zaOkresOdDo: "OD 01.01.2013 DO 31.12.2013" },
            { zaOkresOdDo: "OD 01.01.2014 DO 31.12.2014" },
            { zaOkresOdDo: "OD 01.01.2015 DO 31.12.2015" },
            { zaOkresOdDo: "OD 01.01.2016 DO 31.12.2016" },
            { zaOkresOdDo: "OD 01.01.2017 DO 31.12.2017" },
            { zaOkresOdDo: "OD 01.01.2018 DO 31.12.2018" },
            { zaOkresOdDo: "OD 01.01.2019 DO 31.12.2019" },
            { zaOkresOdDo: "OD 01.01.2020 DO 31.12.2020" },
            { zaOkresOdDo: "OD 01.01.2021 DO 31.12.2021" },
            { zaOkresOdDo: "OD 01.01.2022 DO 31.12.2022" },
            { zaOkresOdDo: "OD 01.01.2023 DO 31.12.2023" },
            { zaOkresOdDo: "OD 01.01.2024 DO 31.12.2024" },
            { zaOkresOdDo: "OD 01.01.2025 DO 31.12.2025" },
          ],
        },
      },
    },
  },
};

describe("KRS Dział 3 — payload reale AVIO POLSKA (KRS 0000002594)", () => {
  const entries = parseKrsFilings(odpisReale);

  it("legge le due forme reali del periodo senza dedurre nulla", () => {
    expect(krsFiscalYear("OD 01.01.2024 DO 31.12.2024")).toBe(2024);
    expect(krsFiscalYear("ROK OBROTOWY 2001")).toBe(2001);
    expect(krsFiscalYear("2007 ROK")).toBe(2007);
    expect(krsFiscalYear("")).toBeUndefined();
    expect(krsFiscalYear(undefined)).toBeUndefined();
  });

  it("espone gli esercizi depositati dal più recente, deduplicati", () => {
    expect(entries[0]).toMatchObject({ year: 2025, filedOn: "2026-06-11", audited: true });
    expect(entries[1]).toMatchObject({ year: 2024, filedOn: "2025-05-13", audited: true });
    expect(entries.map((e) => e.year)).toEqual([
      2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011,
    ]);
    expect(entries.filter((e) => e.year === 2017)).toHaveLength(1);
  });

  it("non produce alcun importo: il registro prova il deposito, non le poste", () => {
    const financials = buildKrsFilingsFinancials(entries);
    expect(financials?.available).toBe(false);
    // Gli esercizi ci sono, gli importi no: ogni riga porta solo periodo, anno
    // e valuta, mai una posta di bilancio che il registro non pubblica.
    expect(financials?.years).toHaveLength(15);
    for (const y of financials?.years ?? []) {
      expect(Object.keys(y).sort()).toEqual(["currency", "periodLabel", "year"]);
    }
    expect(financials?.documents?.[0]).toMatchObject({
      year: 2025,
      availability: "REGISTRY_ONLY",
      restriction: "SESSION_BOUND",
    });
    expect(JSON.stringify(financials)).not.toMatch(/"revenue"|"totalAssets"|"equity"/);
  });
});
