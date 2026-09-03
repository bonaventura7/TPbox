/**
 * Lettura dei CSV pubblici delle due fonti.
 *
 * BCE SDMX (`format=csvdata`): molte colonne, servono `TIME_PERIOD` e `OBS_VALUE`.
 * FRED (`fredgraph.csv`): due colonne, `observation_date` e la serie; i valori
 * mancanti sono un punto.
 *
 * Se la struttura non e' quella attesa il parser solleva un errore invece di
 * indovinare: un cambio di layout della fonte deve rompere in modo visibile.
 */
import type { Observation } from "./as-of";

export class SourceFormatError extends Error {}

/** Divide una riga CSV gestendo i campi tra doppi apici. */
export function splitCsvLine(line: string, separator = ","): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === separator) {
      out.push(field);
      field = "";
      continue;
    }
    field += char ?? "";
  }
  out.push(field);
  return out.map((value) => value.trim());
}

function nonEmptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function toNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.trim();
  if (cleaned === "" || cleaned === "." || cleaned.toUpperCase() === "NA") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function parseEcbCsv(text: string): Observation[] {
  const lines = nonEmptyLines(text);
  const header = lines[0];
  if (header === undefined) throw new SourceFormatError("BCE: risposta vuota");
  const columns = splitCsvLine(header);
  const periodAt = columns.indexOf("TIME_PERIOD");
  const valueAt = columns.indexOf("OBS_VALUE");
  if (periodAt < 0 || valueAt < 0) {
    throw new SourceFormatError(
      `BCE: colonne attese TIME_PERIOD/OBS_VALUE assenti (trovate: ${columns.slice(0, 8).join(", ")})`,
    );
  }
  const out: Observation[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const period = cells[periodAt];
    const value = toNumber(cells[valueAt]);
    if (period === undefined || period === "" || value === null) continue;
    out.push({ period, value });
  }
  if (out.length === 0) throw new SourceFormatError("BCE: nessuna osservazione utilizzabile");
  return out;
}

export function parseFredCsv(text: string): Observation[] {
  const lines = nonEmptyLines(text);
  const header = lines[0];
  if (header === undefined) throw new SourceFormatError("FRED: risposta vuota");
  const columns = splitCsvLine(header);
  const first = columns[0]?.replace(/^\uFEFF/, "").toLowerCase();
  if (first !== "observation_date" && first !== "date") {
    throw new SourceFormatError(`FRED: header inatteso (${columns.slice(0, 3).join(", ")})`);
  }
  const out: Observation[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const period = cells[0];
    const value = toNumber(cells[1]);
    if (period === undefined || period === "" || value === null) continue;
    out.push({ period, value });
  }
  if (out.length === 0) throw new SourceFormatError("FRED: nessuna osservazione utilizzabile");
  return out;
}
