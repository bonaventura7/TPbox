import { describe, expect, it } from "vitest";

import { officialPageFor } from "./official-pages";

describe("officialPageFor", () => {
  it("provides a free Pappers fallback for French company accounts", () => {
    const page = officialPageFor("FR", "911866549", "BARILLET PAU");

    expect(page).toMatchObject({
      url: "https://www.pappers.fr/entreprise/barillet-pau-911866549",
      label: "Pappers — comptes annuels publics",
      mode: "external",
    });
    expect(page?.actionLabel).toBe("Apri i conti annuali");
    expect(page?.instructions).toEqual([
      "Apri la sezione « Comptes annuels ».",
      "Scegli l'esercizio desiderato.",
      "Premi l'icona PDF per scaricare il conto annuale gratuitamente.",
    ]);
  });
});
