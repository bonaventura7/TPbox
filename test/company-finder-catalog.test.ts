import { describe, expect, it } from "vitest";

import { ALL_COUNTRIES, getCountry } from "../src/lib/company-finder/countries";

/**
 * Il catalogo paesi è ciò che la pagina mostra quando una fonte di bilancio
 * gratuita non esiste. Una nota mancante diventerebbe un silenzio in pagina:
 * questi test impediscono che accada.
 */
describe("catalogo paesi del Company Finder", () => {
  it("dichiara per ogni paese registro, autorità e nota sui bilanci", () => {
    for (const country of ALL_COUNTRIES) {
      expect(country.iso, `iso di ${country.nameIt}`).toMatch(/^[A-Z]{2}$/);
      expect(country.registryName.length, `registro di ${country.iso}`).toBeGreaterThan(0);
      expect(country.registryAuthority.length, `autorità di ${country.iso}`).toBeGreaterThan(0);
      expect(country.financials.note.length, `nota bilanci di ${country.iso}`).toBeGreaterThan(20);
    }
  });

  it("non contiene codici paese duplicati", () => {
    const codes = ALL_COUNTRIES.map((country) => country.iso);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("risolve il paese per codice ISO", () => {
    expect(getCountry("DE")?.nameIt).toBe("Germania");
    expect(getCountry("ZZ")).toBeUndefined();
  });

  it("dichiara l'Italia priva di fonte bilanci gratuita", () => {
    // Il deposito presso le CCIAA è a pagamento: la pagina deve dirlo, non
    // fingere una copertura che non c'è.
    expect(getCountry("IT")?.financials.free).toBe(false);
  });
});
