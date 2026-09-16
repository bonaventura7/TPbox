// Prova dal vivo dell'adapter ESEF. Fuori da src/: non entra nella suite.
import {
  fetchEsefFinancials,
  listEsefFilings,
  fiscalYearFromInstant,
  fiscalYearFromPeriod,
} from "./src/lib/company-finder/sources/bilanci/esef-xbrl";

console.log(
  "correzione 1 gennaio:",
  fiscalYearFromInstant("2023-01-01T00:00:00"), "(atteso 2022) |",
  fiscalYearFromInstant("2022-12-31T00:00:00"), "(atteso 2022) |",
  fiscalYearFromPeriod("2022-01-01T00:00:00/2023-01-01T00:00:00"), "(atteso 2022)",
);

const cases: [string, string, string][] = [
  ["Instal Krakow S.A. (PL)", "259400OOMJ31L0SWCY70", "PL"],
  ["IZOSTAL S.A. (PL)", "259400NFU8A8SBP6VC21", "PL"],
];

for (const [name, lei, iso] of cases) {
  console.log(`\n=== ${name} ===`);
  const filings = await listEsefFilings(lei);
  console.log("depositi:", filings.length, "| ultimi:", filings.slice(0, 3).map((f) => `${f.periodEnd}(FY${f.fiscalYear})`).join(" "));
  const r = await fetchEsefFinancials(lei, { iso, maxFilings: 2 });
  console.log("ok:", r.ok, "| valuta:", r.currency, "| errore:", r.error ?? "-");
  for (const y of r.years) {
    console.log(`  FY${y.year}  ricavi=${y.revenue ?? "-"}  EBIT=${y.operatingProfit ?? "-"}  utile=${y.netIncome ?? "-"}  attivo=${y.totalAssets ?? "-"}  PN=${y.equity ?? "-"}  ${y.currency}`);
  }
}

console.log("\n=== Germania: la fonte deve dichiararsi vuota ===");
const de = await fetchEsefFinancials("529900W18LQJJN6SJ336", { iso: "DE" });
console.log("ok:", de.ok, "| errore:", de.error);
