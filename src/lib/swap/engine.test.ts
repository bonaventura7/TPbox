/**
 * Calcolatore Interest Rate Swap — test del nucleo deterministico.
 *
 * I valori attesi sono calcolati a mano dalle convenzioni di mercato, non
 * ripresi da un'altra implementazione: il 30/360 bond basis segue la
 * definizione ISDA 2006 Section 4.16(f), il 30E/360 la 4.16(g), l'ACT/ACT la
 * 4.16(b) nella variante ISDA. Nessun test tocca la rete.
 */

import { describe, expect, it } from "vitest";

import { yearFraction, dayCount } from "./daycount";
import { buildSchedule, maturityFromTenor } from "./schedule";
import { computeSwap } from "./engine";
import type { SwapInput } from "./types";

describe("yearFraction — 30/360 bond basis", () => {
  it("un anno pieno da data omologa vale esattamente 1", () => {
    expect(yearFraction("30/360", "2026-01-01", "2027-01-01")).toBe(1);
  });

  it("porta il 31 di partenza al 30", () => {
    // D1 31 -> 30, D2 28: 30*1 + (28-30) = 28 giorni.
    expect(yearFraction("30/360", "2026-01-31", "2026-02-28")).toBeCloseTo(28 / 360, 12);
  });

  it("il semestre 31 marzo - 30 settembre vale mezzo anno", () => {
    expect(yearFraction("30/360", "2026-03-31", "2026-09-30")).toBeCloseTo(0.5, 12);
  });

  it("non porta il 31 di arrivo al 30 quando la partenza non e' 30 o 31", () => {
    // Divergenza classica dall'Eurobond: D1 28 resta 28, D2 31 resta 31.
    expect(yearFraction("30/360", "2026-02-28", "2026-08-31")).toBeCloseTo(183 / 360, 12);
  });
});

describe("yearFraction — 30E/360 Eurobond", () => {
  it("porta al 30 anche il 31 di arrivo: un giorno in meno del bond basis", () => {
    // D1 28 resta 28, D2 31 -> 30: 30*6 + (30-28) = 182, contro i 183 del 30/360.
    expect(yearFraction("30E/360", "2026-02-28", "2026-08-31")).toBeCloseTo(182 / 360, 12);
  });

  it("coincide col bond basis quando nessuna delle due date cade il 31", () => {
    expect(yearFraction("30E/360", "2026-01-15", "2027-01-15")).toBeCloseTo(
      yearFraction("30/360", "2026-01-15", "2027-01-15"),
      12,
    );
  });
});

describe("yearFraction — basi effettive", () => {
  it("ACT/360 conta i giorni di calendario su 360", () => {
    expect(yearFraction("ACT/360", "2026-01-01", "2026-07-01")).toBeCloseTo(181 / 360, 12);
  });

  it("ACT/365 conta gli stessi giorni su 365", () => {
    expect(yearFraction("ACT/365", "2026-01-01", "2026-07-01")).toBeCloseTo(181 / 365, 12);
  });

  it("ACT/ACT spezza il periodo a cavallo d'anno e vale 1 su dodici mesi", () => {
    expect(yearFraction("ACT/ACT", "2025-07-01", "2026-07-01")).toBeCloseTo(1, 12);
  });

  it("ACT/ACT usa 366 come denominatore nell'anno bisestile", () => {
    expect(yearFraction("ACT/ACT", "2024-01-01", "2025-01-01")).toBeCloseTo(1, 12);
  });

  it("una data invertita o coincidente non produce frazione negativa", () => {
    expect(yearFraction("ACT/360", "2026-07-01", "2026-01-01")).toBe(0);
    expect(yearFraction("30/360", "2026-07-01", "2026-07-01")).toBe(0);
  });
});

describe("dayCount", () => {
  it("restituisce i giorni di calendario effettivi", () => {
    expect(dayCount("2026-01-01", "2026-07-01")).toBe(181);
  });

  it("e' zero su date coincidenti", () => {
    expect(dayCount("2026-01-01", "2026-01-01")).toBe(0);
  });
});

describe("maturityFromTenor", () => {
  it("somma i mesi mantenendo il giorno", () => {
    expect(maturityFromTenor("2026-01-15", 60)).toBe("2031-01-15");
  });

  it("arretra al fine mese quando il giorno non esiste", () => {
    expect(maturityFromTenor("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("rifiuta un tenor non positivo o una data non valida", () => {
    expect(maturityFromTenor("2026-01-15", 0)).toBeNull();
    expect(maturityFromTenor("2026-02-30", 12)).toBeNull();
  });
});

describe("buildSchedule", () => {
  it("genera cinque periodi annuali senza stub", () => {
    const periods = buildSchedule("2026-01-15", "2031-01-15", "ANNUAL");
    expect(periods).toHaveLength(5);
    expect(periods[0]).toMatchObject({
      startDate: "2026-01-15",
      endDate: "2027-01-15",
      stub: false,
    });
    expect(periods[4]).toMatchObject({ startDate: "2030-01-15", endDate: "2031-01-15" });
  });

  it("genera all'indietro dalla scadenza, lasciando lo stub in testa", () => {
    const periods = buildSchedule("2026-03-01", "2031-01-15", "ANNUAL");
    expect(periods).toHaveLength(5);
    expect(periods[0]).toMatchObject({
      startDate: "2026-03-01",
      endDate: "2027-01-15",
      stub: true,
    });
    expect(periods[1]!.stub).toBe(false);
  });

  it("tiene il fine mese quando la scadenza cade l'ultimo giorno del mese", () => {
    const periods = buildSchedule("2026-08-31", "2027-08-31", "SEMI_ANNUAL");
    expect(periods.map((p) => p.endDate)).toEqual(["2027-02-28", "2027-08-31"]);
  });

  it("le frequenze piu' brevi producono piu' periodi", () => {
    expect(buildSchedule("2026-01-15", "2027-01-15", "QUARTERLY")).toHaveLength(4);
    expect(buildSchedule("2026-01-15", "2027-01-15", "MONTHLY")).toHaveLength(12);
  });

  it("i periodi sono contigui: la fine di uno e' l'inizio del successivo", () => {
    const periods = buildSchedule("2026-03-01", "2031-01-15", "SEMI_ANNUAL");
    for (let i = 1; i < periods.length; i += 1) {
      expect(periods[i]!.startDate).toBe(periods[i - 1]!.endDate);
    }
  });

  it("e' vuoto quando la scadenza non e' successiva alla decorrenza", () => {
    expect(buildSchedule("2026-01-15", "2026-01-15", "ANNUAL")).toHaveLength(0);
    expect(buildSchedule("2026-01-15", "2025-01-15", "ANNUAL")).toHaveLength(0);
  });
});

const BASE: SwapInput = {
  effectiveDate: "2026-01-15",
  maturityDate: "2031-01-15",
  notional: 10_000_000,
  currency: "EUR",
  fixedRatePercent: 3.25,
  floatingRatePercent: 2.9,
  fixedDayCount: "30/360",
  fixedFrequency: "ANNUAL",
  floatingDayCount: "ACT/360",
  floatingFrequency: "SEMI_ANNUAL",
};

describe("computeSwap — gamba fissa con le convenzioni richieste", () => {
  it("30/360 annuale su date omologhe: cinque cedole identiche", () => {
    const out = computeSwap({ ...BASE, floatingRatePercent: null });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const fixed = out.result.fixedLeg;
    expect(fixed.periods).toHaveLength(5);
    for (const p of fixed.periods) {
      expect(p.yearFraction).toBeCloseTo(1, 12);
      expect(p.interest).toBeCloseTo(325_000, 6);
    }
    expect(fixed.total).toBeCloseTo(1_625_000, 6);
  });

  it("senza tasso variabile la seconda gamba non viene costruita", () => {
    const out = computeSwap({ ...BASE, floatingRatePercent: null });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.floatingLeg).toBeNull();
    expect(out.result.netTotal).toBeNull();
  });

  it("il netto e' la differenza fra le due gambe dal lato di chi paga fisso", () => {
    const out = computeSwap({
      ...BASE,
      floatingDayCount: "30/360",
      floatingFrequency: "ANNUAL",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.floatingLeg?.total).toBeCloseTo(1_450_000, 6);
    expect(out.result.netTotal).toBeCloseTo(175_000, 6);
  });

  it("la gamba variabile segue la propria frequenza e la propria base", () => {
    const out = computeSwap(BASE);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.floatingLeg?.periods).toHaveLength(10);
    // ACT/360 su dieci semestri del quinquennio 2026-2031: 1826 giorni / 360.
    const total = out.result.floatingLeg!.periods.reduce((s, p) => s + p.yearFraction, 0);
    expect(total).toBeCloseTo(1826 / 360, 9);
  });
});

describe("computeSwap — validazione prima del calcolo", () => {
  it("rifiuta la data swap mancante", () => {
    const out = computeSwap({ ...BASE, effectiveDate: "" });
    expect(out).toEqual({ ok: false, reason: expect.stringContaining("data") });
  });

  it("rifiuta una scadenza non successiva alla data swap", () => {
    expect(computeSwap({ ...BASE, maturityDate: "2026-01-15" }).ok).toBe(false);
    expect(computeSwap({ ...BASE, maturityDate: "2025-01-15" }).ok).toBe(false);
  });

  it("rifiuta un nozionale non positivo", () => {
    expect(computeSwap({ ...BASE, notional: 0 }).ok).toBe(false);
    expect(computeSwap({ ...BASE, notional: -1 }).ok).toBe(false);
    expect(computeSwap({ ...BASE, notional: Number.NaN }).ok).toBe(false);
  });

  it("rifiuta una data inesistente o in formato non ISO", () => {
    expect(computeSwap({ ...BASE, effectiveDate: "2026-02-30" }).ok).toBe(false);
    expect(computeSwap({ ...BASE, effectiveDate: "15/01/2026" }).ok).toBe(false);
  });

  it("accetta il tasso fisso a zero, che e' un valore legittimo", () => {
    expect(computeSwap({ ...BASE, fixedRatePercent: 0 }).ok).toBe(true);
  });

  it("accetta un tasso variabile negativo, come nel decennio dei tassi sotto zero", () => {
    const out = computeSwap({ ...BASE, floatingRatePercent: -0.5 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.floatingLeg!.total).toBeLessThan(0);
  });
});

describe("computeSwap — audit trail", () => {
  it("dichiara le convenzioni usate e la versione del motore", () => {
    const out = computeSwap(BASE);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.audit.engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(out.result.audit.basis).toContain("30/360");
    expect(out.result.audit.basis).toContain("Annual");
  });

  it("avverte che le date non sono aggiustate per i giorni lavorativi", () => {
    const out = computeSwap(BASE);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.warnings.join(" ")).toMatch(/giorni lavorativi/i);
  });

  it("avverte che il tasso variabile e' un'ipotesi piatta, non una curva forward", () => {
    const out = computeSwap(BASE);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.warnings.join(" ")).toMatch(/piatt|forward/i);
  });

  it("non avverte sul variabile quando la gamba variabile non c'e'", () => {
    const out = computeSwap({ ...BASE, floatingRatePercent: null });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.warnings.join(" ")).not.toMatch(/piatt/i);
  });

  it("segnala lo stub quando lo scadenzario ne produce uno", () => {
    const out = computeSwap({ ...BASE, effectiveDate: "2026-03-01" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.warnings.join(" ")).toMatch(/stub/i);
  });
});
