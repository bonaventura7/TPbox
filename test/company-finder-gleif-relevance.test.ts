import { describe, expect, it } from "vitest";

import { gleifNameRelevance, rankRelevantGleifMatches } from "../src/lib/company-finder/sources/gleif";

/**
 * `rankRelevantGleifMatches` scarta tutto sotto 80. Se la forma giuridica di un
 * paese non e' fra i token ignorati, il nome del registro porta token che la
 * ricerca non ha, il punteggio crolla e la societa' GIUSTA viene scartata.
 *
 * Questi casi sono nomi reali restituiti da GLEIF, non inventati.
 */
describe("GLEIF — rilevanza del nome per forma giuridica", () => {
  const casi: [string, string][] = [
    ["ESET", "ESET, spol. s r.o."],
    ["Siemens", "Siemens AG"],
    ["ORLEN", "ORLEN S.A."],
    ["PETTINAROLI UK", "PETTINAROLI UK LIMITED"],
  ];

  it.each(casi)("%s trova %s sopra la soglia di 80", (query, nome) => {
    expect(gleifNameRelevance(query, nome)).toBeGreaterThanOrEqual(80);
  });

  it("la Slovacchia non viene piu' scartata dal ranking", () => {
    const match = {
      lei: "3157000BLLYH4H1SOJ29",
      name: "ESET, spol. s r.o.",
      country: "SK" as const,
      registeredAs: "31333532",
    };
    expect(rankRelevantGleifMatches("ESET", [match])).toHaveLength(1);
  });

  it("non ammorbidisce la soglia: un nome estraneo resta scartato", () => {
    expect(rankRelevantGleifMatches("ESET", [
      { lei: "X", name: "Banca Popolare di Sondrio", country: "IT" as const },
    ])).toHaveLength(0);
  });
});
