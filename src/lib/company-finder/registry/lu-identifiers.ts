// Normalizzazione degli identificativi lussemburghesi. Modulo puro e
// client-safe: lo usano sia l'adapter server-side sia la pagina di
// consultazione ufficiale (official-pages.ts).
//
// Riferimenti del registro (LBR — Registre de Commerce et des Sociétés):
//  · numéro RCS: lettera di sezione + cifre (le società commerciali usano il
//    prefisso "B", es. B60814); è l'identificativo stabile e pubblico.
//  · numéro TVA: "LU" + 8 cifre (matricule diverso dal numero RCS).
//  · denominazione: minimo 3 caratteri per una ricerca sensata sul portale.

export interface LuIdentifiers {
  /** Numero RCS normalizzato, es. "B60814" (sezione + cifre, senza separatori). */
  rcs?: string | undefined;
  /** Denominazione sociale, se sufficientemente lunga per la ricerca. */
  name?: string | undefined;
}

/** Sezioni RCS ammesse dal registro lussemburghese. */
const RCS_SECTION = /^[A-Z]/;

/**
 * Accetta il numero RCS con o senza separatori/spazi e con qualunque
 * combinazione di maiuscole/minuscole. Le società commerciali usano "B", ma il
 * registro assegna altre lettere di sezione: le si conserva senza inventarle.
 */
export function normalizeLuxembourgRcs(value: string | undefined): string | undefined {
  const normalized = (value ?? "").replace(/[\s.-]/g, "").toUpperCase();
  if (!RCS_SECTION.test(normalized)) return undefined;
  return /^[A-Z]\d{2,}$/.test(normalized) ? normalized : undefined;
}

export function normalizeLuIdentifiers(input: {
  vat?: string | undefined;
  query?: string | undefined;
}): LuIdentifiers {
  const raw = (input.vat ?? "").trim();
  const name = (input.query ?? "").trim();
  const ids: LuIdentifiers = {};

  const rcs = normalizeLuxembourgRcs(raw);
  if (rcs) ids.rcs = rcs;

  if (name.length >= 3) ids.name = name;
  return ids;
}
