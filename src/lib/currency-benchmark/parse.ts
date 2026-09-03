/**
 * Lettura dei numeri incollati da Excel.
 *
 * Le esportazioni italiane usano la virgola decimale e il punto come separatore
 * delle migliaia, quelle anglosassoni il contrario. Dove la lettura sarebbe
 * ambigua (due virgole, due punti) il valore viene rifiutato invece di
 * interpretato: un comparabile letto male falsa tutto il range.
 */

export type ParseOutcome =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly reason: "vuoto" | "ambiguo" | "non numerico" };

export function parseDecimal(input: string): ParseOutcome {
  let text = input.trim();
  if (text === "") return { ok: false, reason: "vuoto" };
  text = text.replace(/\s/g, "").replace(/%$/, "");

  const commas = (text.match(/,/g) ?? []).length;
  const dots = (text.match(/\./g) ?? []).length;

  if (commas > 0 && dots > 0) {
    // L'ultimo separatore che appare e' quello decimale.
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (commas > 0) {
    if (commas > 1) return { ok: false, reason: "ambiguo" };
    text = text.replace(",", ".");
  } else if (dots > 1) {
    return { ok: false, reason: "ambiguo" };
  }

  if (!/^[-+]?\d*\.?\d+$/.test(text)) return { ok: false, reason: "non numerico" };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, reason: "non numerico" };
  return { ok: true, value };
}

export interface PastedRow {
  readonly id: string;
  readonly raw: string;
  readonly value: number;
}

export interface PasteResult {
  readonly rows: readonly PastedRow[];
  readonly skipped: readonly { readonly line: string; readonly reason: string }[];
}

/**
 * Righe incollate da un foglio: una o due colonne, separate da tabulazione,
 * punto e virgola o due o piu' spazi. Con una sola colonna il valore e' la
 * metrica e l'identificativo viene generato.
 */
export function parsePastedRows(text: string, startIndex: number): PasteResult {
  const rows: PastedRow[] = [];
  const skipped: { line: string; reason: string }[] = [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");

  for (const line of lines) {
    const cells = line
      .trim()
      .split(/\t|;| {2,}/)
      .map((cell) => cell.trim())
      .filter((cell) => cell !== "");
    if (cells.length === 0) continue;
    const raw = cells.length === 1 ? cells[0] : cells[cells.length - 1];
    const parsed = parseDecimal(raw ?? "");
    if (!parsed.ok) {
      skipped.push({ line: line.trim(), reason: parsed.reason });
      continue;
    }
    const generated = `RIGA-${String(startIndex + rows.length + 1).padStart(4, "0")}`;
    rows.push({
      id: cells.length === 1 ? generated : cells.slice(0, -1).join(" "),
      raw: raw ?? "",
      value: parsed.value,
    });
  }

  return { rows, skipped };
}
