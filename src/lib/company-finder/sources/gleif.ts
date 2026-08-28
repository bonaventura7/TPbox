// ---------- GLEIF — risoluzione "nome società" → identificativo di registro ----------
// Il buco più grosso del Company Finder era la ricerca per SOLO NOME: senza
// numero di IVA quasi nessun registro nazionale è interrogabile, e senza paese
// la ricerca non partiva nemmeno.
//
// GLEIF (Global Legal Entity Identifier Foundation) pubblica il registro
// mondiale dei LEI: API aperta, gratuita, senza chiave. Ogni record porta la
// denominazione ufficiale, il paese, e soprattutto `registeredAs`, cioè
// l'identificativo dell'entità nel registro NAZIONALE (CVR danese, HRB tedesco,
// codice fiscale italiano, SIREN francese…). È esattamente la chiave che
// servisse agli adapter già presenti.
//
//   GET https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=<nome>
//
// Limite dichiarato: copre solo chi ha un LEI. Le società non quotate e senza
// operatività sui mercati finanziari spesso non ce l'hanno, e in quel caso
// questa fonte non trova nulla: va detto, non aggirato.

import type { Iso2 } from "../types";

const BASE = "https://api.gleif.org/api/v1/lei-records";

export interface GleifMatch {
  lei: string;
  name: string;
  country: Iso2;
  /** Identificativo nel registro nazionale (CVR, HRB, SIREN, codice fiscale…). */
  registeredAs?: string | undefined;
  address?: string | undefined;
  status?: string | undefined;
}

export interface GleifResult {
  ok: boolean;
  matches: GleifMatch[];
  error?: string | undefined;
}

interface GleifAddress {
  addressLines?: string[] | undefined;
  city?: string | undefined;
  postalCode?: string | undefined;
  country?: string | undefined;
}

interface GleifEntity {
  legalName?: { name?: string | undefined } | undefined;
  legalAddress?: GleifAddress | undefined;
  registeredAs?: string | undefined;
  status?: string | undefined;
}

interface GleifRecord {
  attributes?: { lei?: string | undefined; entity?: GleifEntity | undefined } | undefined;
}

function formatAddress(address: GleifAddress | undefined): string | undefined {
  if (!address) return undefined;
  const parts = [...(address.addressLines ?? []), address.postalCode, address.city].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return parts.length > 0 ? parts.join(", ").toLowerCase() : undefined;
}

/**
 * Cerca per denominazione. `country`, se indicato, restringe alla giurisdizione:
 * senza il filtro "Carlsberg A/S" restituisce anche le controllate estere.
 */
export async function searchGleif(
  name: string,
  country: string,
  timeoutMs = 10000,
): Promise<GleifResult> {
  const term = name.trim();
  if (term.length < 3) return { ok: false, matches: [], error: "nome troppo corto" };

  const params = new URLSearchParams();
  params.set("filter[entity.legalName]", term);
  params.set("page[size]", "5");
  if (country) params.set("filter[entity.legalAddress.country]", country.toUpperCase());

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}?${params.toString()}`, {
      headers: { Accept: "application/vnd.api+json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, matches: [], error: `GLEIF HTTP ${res.status}` };

    const json = (await res.json()) as { data?: GleifRecord[] | undefined };
    const matches: GleifMatch[] = (json.data ?? [])
      .map((record): GleifMatch | undefined => {
        const entity = record.attributes?.entity;
        const lei = record.attributes?.lei;
        const legalName = entity?.legalName?.name;
        const iso = entity?.legalAddress?.country;
        if (!lei || !legalName || !iso) return undefined;
        return {
          lei,
          name: legalName,
          country: iso.toUpperCase(),
          registeredAs: entity?.registeredAs,
          address: formatAddress(entity?.legalAddress),
          status: entity?.status ? entity.status.toLowerCase() : undefined,
        };
      })
      .filter((match): match is GleifMatch => Boolean(match));

    return { ok: true, matches };
  } catch (e) {
    const err = e as { name?: string | undefined; message?: string | undefined };
    return {
      ok: false,
      matches: [],
      error:
        err?.name === "AbortError" ? "GLEIF: timeout" : (err?.message ?? "GLEIF: errore di rete"),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Le sole cifre di `registeredAs`, quando l'identificativo nazionale è
 * numerico (CVR danese, codice fiscale italiano, SIREN francese). Per HRB
 * tedeschi e simili restituisce undefined: non sono numeri di registro
 * utilizzabili dagli adapter, che si aspettano cifre.
 */
export function numericRegistryId(registeredAs: string | undefined): string | undefined {
  if (!registeredAs) return undefined;
  const trimmed = registeredAs.trim();
  return /^[0-9]{6,16}$/.test(trimmed) ? trimmed : undefined;
}
