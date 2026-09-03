// Normalizzazione degli identificativi ungheresi. Modulo puro e client-safe:
// lo usano sia l'adapter server-side sia la pagina di consultazione ufficiale.

export interface HuIdentifiers {
  cegjegyzekszam?: string | undefined;
  adoszam8?: string | undefined;
  name?: string | undefined;
}

/**
 *  · adószám: 8 cifre (törzsszám, con o senza prefisso HU o suffissi)
 *  · cégjegyzékszám: NN-NN-NNNNNN
 *  · denominazione: minimo 4 caratteri, come impone il form ufficiale
 */
export function normalizeHuIdentifiers(input: {
  vat?: string | undefined;
  query?: string | undefined;
}): HuIdentifiers {
  const raw = (input.vat ?? "").trim();
  const name = (input.query ?? "").trim();
  const ids: HuIdentifiers = {};

  const compact = raw.replace(/\s/g, "").replace(/^HU/i, "");
  const ceg = compact.match(/^(\d{2})-?(\d{2})-?(\d{6})$/);
  if (ceg) {
    ids.cegjegyzekszam = `${ceg[1]}-${ceg[2]}-${ceg[3]}`;
  } else {
    const onlyDigits = compact.replace(/\D/g, "");
    if (/^\d{8}$/.test(onlyDigits) || /^\d{11}$/.test(onlyDigits)) {
      ids.adoszam8 = onlyDigits.slice(0, 8);
    }
  }

  if (name.length >= 4) ids.name = name;
  return ids;
}
