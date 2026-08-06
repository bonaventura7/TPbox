/**
 * Amount B – Golden test
 *
 * I valori attesi provengono dal workbook OCSE "Pricing Automation Tool for
 * the Simplified and Streamlined Approach" (February 2026 version). Il caso
 * base riproduce il campione Japan precaricato nel workbook; gli altri casi
 * coprono i rami che il campione non tocca.
 */

import { describe, expect, it } from "vitest";

import { averageBalances, classifyFactorIntensity, computeAmountB } from "./engine";
import type { AmountBInput } from "./model";

/** Campione Japan, così come precaricato nei fogli 1 e 2 del workbook. */
const JAPAN_SAMPLE: AmountBInput = {
  jurisdiction: "Japan",
  datasetVersion: "2026-01",
  oesUpperBound: 0.3,
  netRevenues: [199, 195, 205],
  cogs: [145, 142, 154],
  operatingExpenses: [50, 47, 46],
  netRevenuesYearX: 200,
  operatingExpensesYearX: 49,
  fixedAssets: [60, 40, 44, 36],
  debtors: [35, 25, 19, 33],
  stock: [30, 20, 16, 34],
  creditors: [33, 33, 35, 37],
  industry: { kind: "single", industryGrouping: 1 },
};

const sample = (patch: Partial<AmountBInput>): AmountBInput => ({ ...JAPAN_SAMPLE, ...patch });

describe("averageBalances", () => {
  it("media apertura e chiusura sui quattro esercizi", () => {
    expect(averageBalances([33, 33, 35, 37])).toEqual([33, 34, 36]);
  });

  it("usa il saldo puntuale quando tutti gli esercizi precedenti sono a zero", () => {
    // Società con storico patrimoniale incompleto: x-4 assente.
    expect(averageBalances([0, 10, 20, 30])).toEqual([10, 15, 25]);
    // x-4 e x-3 assenti.
    expect(averageBalances([0, 0, 20, 30])).toEqual([0, 20, 25]);
  });
});

describe("classifyFactorIntensity", () => {
  it("rispetta gli estremi delle fasce", () => {
    expect(classifyFactorIntensity(0.45, 0.2)).toBe("A");
    expect(classifyFactorIntensity(0.4499, 0.2)).toBe("B");
    expect(classifyFactorIntensity(0.3, 0.2)).toBe("B");
    expect(classifyFactorIntensity(0.2999, 0.2)).toBe("C");
    expect(classifyFactorIntensity(0.15, 0.2)).toBe("C");
    // Sotto il 15% di OAS la distinzione D/E dipende dall'OES.
    expect(classifyFactorIntensity(0.1499, 0.1)).toBe("D");
    expect(classifyFactorIntensity(0.1499, 0.0999)).toBe("E");
  });
});

describe("campione Japan", () => {
  const r = computeAmountB(JAPAN_SAMPLE);

  it("non produce errori", () => {
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("OES pari al 23,87% e criterio di scoping soddisfatto", () => {
    expect(r.scoping.oes).toBeCloseTo(143 / 599, 10);
    expect(r.scoping.oes).toBeCloseTo(0.2387, 4);
    expect(r.scoping.verdict).toBe("Quantitative scoping criteria met");
  });

  it("giorni di debito commerciale 83,07 / 87,39 / 85,32, guardrail non attivato", () => {
    const days = r.accountsPayable.map((y) => y.days);
    expect(days[0]).toBeCloseTo(83.07, 2);
    expect(days[1]).toBeCloseTo(87.39, 2);
    expect(days[2]).toBeCloseTo(85.32, 2);
    expect(r.accountsPayable.every((y) => y.meetsThreshold === true)).toBe(true);
    expect(r.guardrailTriggered).toBe(false);
  });

  it("capitale circolante e attività operative nette", () => {
    expect(r.capital.map((c) => c.workingCapital)).toEqual([22, 6, 15]);
    expect(r.capital.map((c) => c.netOperatingAssets)).toEqual([72, 48, 55]);
  });

  it("OAS pari al 29,22% e factor intensity C", () => {
    expect(r.factorIntensity.oas).toBeCloseTo(175 / 599, 10);
    expect(r.factorIntensity.classification).toBe("C");
    // Il confronto senza guardrail si mostra solo quando il guardrail scatta.
    expect(r.factorIntensity.classificationWithoutGuardrail).toBeNull();
  });

  it("return della Section 5.1 al 2,50%, fascia 2,00% - 3,00%", () => {
    expect(r.section51.returnOnSales).toBeCloseTo(0.025, 10);
    expect(r.section51.rangeLower).toBeCloseTo(0.02, 10);
    expect(r.section51.rangeUpper).toBeCloseTo(0.03, 10);
  });

  it("nessuna rettifica sotto 5.2 e 5.3, return finale 2,50%", () => {
    expect(r.section52.cap).toBe(0.6);
    expect(r.section52.equivalentReturnOnOpEx).toBeCloseTo(5 / 49, 10);
    expect(r.section52.capTriggered).toBe(false);
    expect(r.section52.collarTriggered).toBe(false);
    expect(r.section53.damQualifying).toBe(false);
    expect(r.finalReturnOnSales).toBeCloseTo(0.025, 10);
    expect(r.finalEbit).toBeCloseTo(5, 10);
  });

  it("registra le versioni usate", () => {
    expect(r.metadata.workbookVersion).toBe("2026-02");
    expect(r.metadata.jurisdictionDatasetVersion).toBe("2026-01");
    expect(r.metadata.datasetChecksums.jurisdictions).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("Section 5.2 – operating expense cross-check", () => {
  it("cap attivato quando il rendimento sui costi operativi supera il cap", () => {
    // EBIT 5.1 = 200 * 2,50% = 5; su 5 di OpEx il rendimento è 100%, oltre il cap del 60%.
    const r = computeAmountB(sample({ operatingExpensesYearX: 5 }));
    expect(r.section52.equivalentReturnOnOpEx).toBeCloseTo(1, 10);
    expect(r.section52.capTriggered).toBe(true);
    expect(r.section52.collarTriggered).toBe(false);
    // Rettifica al ribasso fino a un rendimento pari al cap: 5 * 60% = 3 su 200 di ricavi.
    expect(r.section52.adjustedEbit).toBeCloseTo(3, 10);
    expect(r.section52.adjustedReturnOnSales).toBeCloseTo(0.015, 10);
    expect(r.finalReturnOnSales).toBeCloseTo(0.015, 10);
  });

  it("collar attivato quando il rendimento sui costi operativi scende sotto il 10%", () => {
    const r = computeAmountB(sample({ operatingExpensesYearX: 100 }));
    expect(r.section52.equivalentReturnOnOpEx).toBeCloseTo(0.05, 10);
    expect(r.section52.collarTriggered).toBe(true);
    // Rettifica al rialzo fino al collar: 100 * 10% = 10 su 200 di ricavi.
    expect(r.section52.adjustedReturnOnSales).toBeCloseTo(0.05, 10);
    expect(r.finalReturnOnSales).toBeCloseTo(0.05, 10);
  });

  it("le giurisdizioni di Category 2 usano le fasce cap alternative", () => {
    // Albania: Category 2, quindi cap alternativo del 70% invece del 60%.
    const r = computeAmountB(sample({ jurisdiction: "Albania" }));
    expect(r.jurisdiction?.category).toBe(2);
    expect(r.section52.capRatesApplicable).toBe("Alternative cap rates");
    expect(r.section52.cap).toBe(0.7);
  });
});

describe("Section 5.3 – data availability mechanism", () => {
  it("somma la rettifica di rischio al return per le giurisdizioni qualificate", () => {
    // Albania 2026-01: DAM qualifying, rating BB, net risk adjustment 1,2%.
    const r = computeAmountB(sample({ jurisdiction: "Albania" }));
    expect(r.section53.damQualifying).toBe(true);
    expect(r.section53.creditRating).toBe("BB");
    expect(r.section53.netRiskAdjustment).toBe(0.012);
    expect(r.section53.oasCapped).toBeCloseTo(175 / 599, 10);
    expect(r.section53.adjustment).toBeCloseTo(0.012 * (175 / 599), 10);
    expect(r.finalReturnOnSales).toBeCloseTo(0.025 + 0.012 * (175 / 599), 10);
  });

  it("applica il cap dell 85% all OAS prima della rettifica", () => {
    // Immobilizzazioni molto elevate: OAS oltre l'85%.
    const r = computeAmountB(
      sample({ jurisdiction: "Albania", fixedAssets: [600, 600, 600, 600] }),
    );
    expect(r.factorIntensity.oas).toBeGreaterThan(0.85);
    expect(r.section53.oasCapped).toBe(0.85);
    expect(r.section53.adjustment).toBeCloseTo(0.012 * 0.85, 10);
  });

  it("la versione della data table cambia il rating e quindi il risultato", () => {
    // Albania è passata da BB- (dicembre 2024) a BB (gennaio 2026).
    const older = computeAmountB(sample({ jurisdiction: "Albania", datasetVersion: "2024-12" }));
    expect(older.section53.creditRating).toBe("BB-");
    expect(older.section53.netRiskAdjustment).toBe(0.018);
    const newer = computeAmountB(sample({ jurisdiction: "Albania", datasetVersion: "2026-01" }));
    expect(newer.finalReturnOnSales).not.toBeCloseTo(older.finalReturnOnSales!, 6);
  });
});

describe("multi-industry e de minimis", () => {
  it("sotto la soglia del 20% il return è quello della prima categoria", () => {
    const r = computeAmountB(
      sample({
        industry: {
          kind: "multi",
          first: { industryGrouping: 1, netRevenues: 180 },
          second: { industryGrouping: 3, netRevenues: 20 },
        },
      }),
    );
    expect(r.section51.deMinimisExceeded).toBe(false);
    expect(r.section51.weightedAverageRequired).toBe(false);
    expect(r.section51.returnOnSales).toBeCloseTo(0.025, 10);
  });

  it("oltre la soglia si usa la media ponderata delle celle della matrice", () => {
    // Ripartizione del workbook: 120 su gruppo 1, 50 su gruppo 3, 30 su gruppo 2.
    const r = computeAmountB(
      sample({
        industry: {
          kind: "multi",
          first: { industryGrouping: 1, netRevenues: 120 },
          second: { industryGrouping: 3, netRevenues: 50 },
          third: { industryGrouping: 2, netRevenues: 30 },
        },
      }),
    );
    expect(r.section51.deMinimisExceeded).toBe(true);
    expect(r.section51.weightedAverageRequired).toBe(true);
    // 0,6 * 2,50% + 0,25 * 4,50% + 0,15 * 3,00% = 3,075%
    expect(r.section51.returnOnSales).toBeCloseTo(0.03075, 10);
  });

  it("segnala se la ripartizione non quadra con i ricavi dell esercizio x", () => {
    const r = computeAmountB(
      sample({
        industry: {
          kind: "multi",
          first: { industryGrouping: 1, netRevenues: 100 },
          second: { industryGrouping: 2, netRevenues: 50 },
        },
      }),
    );
    expect(r.warnings.map((w) => w.code)).toContain("INDUSTRY_SPLIT_MISMATCH");
  });
});

describe("guardrail sui debiti commerciali", () => {
  it("oltre i 90 giorni sostituisce i debiti con quelli rettificati", () => {
    const r = computeAmountB(sample({ creditors: [50, 50, 60, 70] }));
    expect(r.guardrailTriggered).toBe(true);
    const first = r.accountsPayable[0];
    expect(first?.days).toBeCloseTo((50 / 145) * 365, 8);
    expect(first?.meetsThreshold).toBe(false);
    // Debiti rettificati: COGS / 365 * 90.
    expect(first?.adjustedCreditors).toBeCloseTo((145 / 365) * 90, 10);
    expect(first?.creditorsUsed).toBeCloseTo((145 / 365) * 90, 10);
    // Il confronto senza guardrail viene esposto solo in questo caso.
    expect(r.factorIntensity.classificationWithoutGuardrail).not.toBeNull();
  });

  it("esattamente 90 giorni rispetta la soglia", () => {
    // Debiti tali da produrre esattamente 90 giorni su COGS costanti.
    const c = (146 / 365) * 90;
    const r = computeAmountB(sample({ cogs: [146, 146, 146], creditors: [c, c, c, c] }));
    expect(r.accountsPayable[0]?.days).toBeCloseTo(90, 9);
    expect(r.accountsPayable[0]?.meetsThreshold).toBe(true);
    expect(r.guardrailTriggered).toBe(false);
  });
});

describe("criterio di scoping non soddisfatto", () => {
  it("OES sotto il 3%", () => {
    const r = computeAmountB(sample({ operatingExpenses: [5, 5, 5] }));
    expect(r.scoping.oes).toBeCloseTo(15 / 599, 10);
    expect(r.scoping.verdict).toBe("Quantitative scoping criteria not met");
  });

  it("OES oltre il limite superiore della giurisdizione", () => {
    const r = computeAmountB(sample({ oesUpperBound: 0.2 }));
    expect(r.scoping.verdict).toBe("Quantitative scoping criteria not met");
  });

  it("segnala un limite superiore fuori dall intervallo 20-30%", () => {
    const r = computeAmountB(sample({ oesUpperBound: 0.5 }));
    expect(r.warnings.map((w) => w.code)).toContain("OES_UPPER_BOUND_OUT_OF_RANGE");
  });
});

describe("giurisdizione assente", () => {
  it("produce un errore bloccante", () => {
    const r = computeAmountB(sample({ jurisdiction: "Atlantide" }));
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain("JURISDICTION_NOT_FOUND");
  });
});
