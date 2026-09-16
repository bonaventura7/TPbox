import { describe, expect, it } from "vitest";

import { extractFromBilanSaisi, flattenLiassePages, liasseMapFor, type LiasseRow } from "./liasse-fiscale";

/** Liassa completa coerente: attivo = passivo, CA < proventi. */
const COERENTE: LiasseRow[] = [
  { code: "FJ", m1: 700, m2: 300, m3: 1000, m4: 900 },
  { code: "FR", m3: 1100, m4: 980 },
  { code: "GF", m3: 950, m4: 880 },
  { code: "GG", m3: 150, m4: 100 },
  { code: "HN", m1: 90, m2: 60 },
  { code: "CO", m1: 3000, m2: 1000, m3: 2000, m4: 1800 },
  { code: "EE", m1: 2000, m2: 1800 },
  { code: "DL", m1: 800, m2: 700 },
];

function base(rows: LiasseRow[] = COERENTE) {
  return { siren: "383474814", dateCloture: "2024-12-31", codeTypeBilan: "C", rows, currency: "EUR" };
}

describe("liassa — colonne", () => {
  it("prende il totale dalla terza colonna, non dal mercato interno", () => {
    const result = extractFromBilanSaisi(base());
    const current = result.years.find((entry) => entry.year === 2024);
    expect(current?.revenue).toBe(1000);
    expect(current?.revenue).not.toBe(700);
  });

  it("legge il risultato netto dalla pagina 04, che usa m1/m2", () => {
    const result = extractFromBilanSaisi(base());
    expect(result.years.find((entry) => entry.year === 2024)?.netIncome).toBe(90);
    expect(result.years.find((entry) => entry.year === 2023)?.netIncome).toBe(60);
  });

  it("prende l'attivo netto e non il lordo", () => {
    const result = extractFromBilanSaisi(base());
    expect(result.years.find((entry) => entry.year === 2024)?.totalAssets).toBe(2000);
  });

  it("restituisce anche l'esercizio comparativo", () => {
    const result = extractFromBilanSaisi(base());
    expect(result.years.map((entry) => entry.year)).toEqual([2024, 2023]);
  });
});

describe("liassa — controlli di quadratura", () => {
  it("non restituisce numeri se attivo e passivo non quadrano", () => {
    const rows = COERENTE.map((row) => (row.code === "EE" ? { ...row, m1: 5000, m2: 4800 } : row));
    const result = extractFromBilanSaisi(base(rows));
    expect(result.ok).toBe(false);
    expect(result.years).toHaveLength(0);
    expect(result.error).toContain("non quadrano");
  });

  it("non restituisce numeri se la cifra d'affari supera i proventi d'esercizio", () => {
    const rows = COERENTE.map((row) => (row.code === "FJ" ? { ...row, m3: 5000, m4: 4800 } : row));
    const result = extractFromBilanSaisi(base(rows));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("superiore al totale dei proventi");
  });

  it("avverte, senza scartare, se il risultato non coincide con proventi meno oneri", () => {
    const rows = COERENTE.map((row) => (row.code === "GG" ? { ...row, m3: 5, m4: 4 } : row));
    const result = extractFromBilanSaisi(base(rows));
    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("voci rettificative");
  });
});

describe("liassa — stato del deposito", () => {
  it("si ferma sul bilancio integralmente confidenziale", () => {
    const result = extractFromBilanSaisi({ ...base(), codeConfidentialite: 1 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("confidenziale");
  });

  it("si ferma sul bilancio depositato ma non digitato", () => {
    const result = extractFromBilanSaisi({ ...base(), codeSaisie: 7 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("non digitato");
  });

  it("segnala le incoerenze dichiarate dall'INPI senza scartare i dati", () => {
    const result = extractFromBilanSaisi({ ...base(), codeSaisie: 1 });
    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("incoerenze");
  });

  it("dichiara le voci prese da una mappatura non ancora confermata", () => {
    const result = extractFromBilanSaisi(base());
    expect(result.unverifiedFields).toContain("equity");
  });

  it("non deduce nulla per un tipo di bilancio senza mappatura", () => {
    const result = extractFromBilanSaisi({ ...base(), codeTypeBilan: "B" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("senza mappatura");
    expect(liasseMapFor("B")).toBeUndefined();
  });
});

describe("liassa — appiattimento delle pagine", () => {
  it("raccoglie i codici da pagine annidate e accetta montant1 come m1", () => {
    const detail = { pages: [{ numero: 1, liasses: [{ code: "CO", montant3: "2 000,50" }] }, { numero: 3, liasses: [{ code: "FJ", m3: 1000 }] }] };
    const rows = flattenLiassePages(detail);
    expect(rows.find((row) => row.code === "CO")?.m3).toBe(2000.5);
    expect(rows.find((row) => row.code === "FJ")?.m3).toBe(1000);
  });

  it("ignora le righe senza alcun importo", () => {
    expect(flattenLiassePages({ pages: [{ liasses: [{ code: "XX" }] }] })).toHaveLength(0);
  });
});
