/**
 * Amount B – Lettura dei valori digitati.
 */

/**
 * Converte in numero una stringa digitata dall'utente, accettando la virgola
 * come separatore decimale e gli spazi come separatore delle migliaia.
 * Un campo vuoto o non interpretabile vale zero, come una cella vuota del
 * workbook.
 */
export function parseAmount(raw: string): number {
  if (raw.trim() === "") return 0;
  const normalised = raw.replace(/\s/g, "").replace(",", ".");
  const value = Number(normalised);
  return Number.isFinite(value) ? value : 0;
}
