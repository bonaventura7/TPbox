import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Il badge "Dato demo" era reso in modo incondizionato su ogni scheda. Finché tutti gli
 * articoli erano dimostrativi la resa era corretta per caso, non per costruzione: dal
 * momento in cui la sezione legge il database, lo stesso codice marcherebbe come finto
 * anche un articolo verificato e firmato.
 *
 * I due errori sono simmetrici e valgono uguale. Un contenuto inventato senza etichetta
 * inganna il lettore; un contenuto verificato etichettato come finto svaluta il lavoro
 * redazionale e rende il badge rumore, che è il modo in cui un'etichetta smette di
 * essere letta.
 *
 * Il controllo è sul sorgente perché la proprietà da difendere è che quel badge non
 * possa tornare incondizionato in un refactor distratto.
 */
const source = readFileSync(new URL("../src/components/news/NewsCard.tsx", import.meta.url), "utf8");

describe("NewsCard: l'etichetta dimostrativa segue il dato", () => {
  it("rende DemoBadge solo per gli articoli dimostrativi", () => {
    expect(source).toMatch(/item\.isDemo\s*\?\s*<DemoBadge\s*\/>/);
  });

  it("non contiene piu un DemoBadge incondizionato", () => {
    const unconditional = source
      .split("\n")
      .filter((line) => line.includes("<DemoBadge"))
      .filter((line) => !line.includes("item.isDemo"));
    expect(unconditional).toEqual([]);
  });

  it("mostra chi risponde del contenuto quando l'articolo è reale", () => {
    expect(source).toContain("A cura di");
    expect(source).toMatch(/item\.reviewedBy/);
  });

  it("dichiara la bozza assistita da AI solo quando lo è", () => {
    expect(source).toMatch(/item\.authorType === "AI_ASSISTED"/);
  });
});
