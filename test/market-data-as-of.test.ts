import { describe, expect, it } from "vitest";

import {
  comparePeriodEnd,
  isAvailableAt,
  isIsoDate,
  lastObservationAtOrBefore,
  periodEnd,
  PeriodFormatError,
} from "../src/lib/market-data/as-of";
import {
  parseEcbCsv,
  parseFredCsv,
  SourceFormatError,
  splitCsvLine,
} from "../src/lib/market-data/csv";

/**
 * La semantica as-of e' la parte del sistema che sbaglia in silenzio: una media
 * di periodo usata prima che il periodo sia chiuso e' un dato che non esiste
 * ancora, e un confronto fra stringhe manda un trimestre dopo un giorno di
 * settembre. Questi test bloccano entrambe le cose.
 */
describe("periodi e semantica as-of", () => {
  it("chiude i periodi sull'ultimo giorno", () => {
    expect(periodEnd("2026-09-03")).toEqual([2026, 9, 3]);
    expect(periodEnd("2026-08")).toEqual([2026, 8, 31]);
    expect(periodEnd("2026-02")).toEqual([2026, 2, 28]);
    expect(periodEnd("2024-02")).toEqual([2024, 2, 29]);
    expect(periodEnd("2026-Q2")).toEqual([2026, 6, 30]);
    expect(periodEnd("2026-S1")).toEqual([2026, 6, 30]);
    expect(periodEnd("2025")).toEqual([2025, 12, 31]);
  });

  it("rifiuta i periodi che non riconosce", () => {
    expect(() => periodEnd("settembre 2026")).toThrow(PeriodFormatError);
    expect(() => periodEnd("2026-13")).toThrow(PeriodFormatError);
  });

  it("ordina un trimestre prima di una data successiva, dove il confronto fra stringhe fallirebbe", () => {
    expect("2026-Q2" > "2026-09-03").toBe(true);
    expect(comparePeriodEnd(periodEnd("2026-Q2"), periodEnd("2026-09-03"))).toBeLessThan(0);
  });

  it("non rende disponibile la media di un mese prima della sua fine", () => {
    expect(isAvailableAt("2026-08", "2026-08-15")).toBe(false);
    expect(isAvailableAt("2026-08", "2026-08-31")).toBe(true);
    expect(isAvailableAt("2026-08", "2026-09-03")).toBe(true);
  });

  it("prende l'ultima osservazione chiusa entro la data richiesta", () => {
    const series = [
      { period: "2026-07", value: 2.6 },
      { period: "2026-08", value: 2.71 },
      { period: "2026-09", value: 2.8 },
    ];
    expect(lastObservationAtOrBefore(series, "2026-09-03")?.value).toBe(2.71);
    expect(lastObservationAtOrBefore(series, "2026-09-30")?.value).toBe(2.8);
    expect(lastObservationAtOrBefore(series, "2026-06-30")).toBeNull();
  });

  it("ignora le osservazioni con periodo illeggibile invece di fermarsi", () => {
    const series = [
      { period: "2026-08", value: 1 },
      { period: "boh", value: 999 },
    ];
    expect(lastObservationAtOrBefore(series, "2026-09-01")?.value).toBe(1);
  });

  it("valida le date ISO", () => {
    expect(isIsoDate("2026-09-03")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("03/09/2026")).toBe(false);
  });
});

describe("lettura dei CSV delle fonti", () => {
  it("legge il csvdata della BCE cercando le colonne per nome", () => {
    const csv = [
      "KEY,FREQ,CURRENCY,TIME_PERIOD,OBS_VALUE,OBS_STATUS",
      "EXR.D.GBP.EUR.SP00.A,D,GBP,2026-09-02,0.86123,A",
      "EXR.D.GBP.EUR.SP00.A,D,GBP,2026-09-03,0.86055,A",
    ].join("\n");
    expect(parseEcbCsv(csv)).toEqual([
      { period: "2026-09-02", value: 0.86123 },
      { period: "2026-09-03", value: 0.86055 },
    ]);
  });

  it("gestisce i campi tra apici con virgole interne", () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
    expect(splitCsvLine('"con ""apici""",x')).toEqual(['con "apici"', "x"]);
  });

  it("rompe se la BCE cambia struttura invece di indovinare le colonne", () => {
    expect(() => parseEcbCsv("A,B\n1,2")).toThrow(SourceFormatError);
  });

  it("legge il CSV di FRED e salta i valori mancanti", () => {
    const csv = [
      "observation_date,DGS10",
      "2026-09-01,4.79",
      "2026-09-02,.",
      "2026-09-03,4.81",
    ].join("\n");
    expect(parseFredCsv(csv)).toEqual([
      { period: "2026-09-01", value: 4.79 },
      { period: "2026-09-03", value: 4.81 },
    ]);
  });

  it("rifiuta un header FRED inatteso", () => {
    expect(() => parseFredCsv("qualcosa,altro\n1,2")).toThrow(SourceFormatError);
  });
});
