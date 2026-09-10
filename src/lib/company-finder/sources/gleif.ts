// ---------- GLEIF — risoluzione "nome società" → identificativo di registro ----------

import type { Iso2 } from "../types";

const BASE = "https://api.gleif.org/api/v1/lei-records";

export interface GleifMatch {
  lei: string;
  name: string;
  country: Iso2;
  registeredAs?: string | undefined;
  registeredAt?: string | undefined;
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

interface GleifRegisteredAt {
  id?: string | undefined;
  other?: string | undefined;
}

interface GleifEntity {
  legalName?: { name?: string | undefined } | undefined;
  legalAddress?: GleifAddress | undefined;
  registeredAs?: string | undefined;
  registeredAt?: GleifRegisteredAt | undefined;
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
 * Score conservativo: una corrispondenza esatta vince sempre; risultati che
 * aggiungono parole sostanziali (es. "Siemens Healthineers AG" per "Siemens AG")
 * restano sotto soglia e non possono intestare la scheda alla società sbagliata.
 */
/**
 * Suffissi/forme giuridiche da neutralizzare nel confronto dei nomi: un utente
 * cerca "Maspex Holding", il registro deposita "MASPEX HOLDING SPÓŁKA AKCYJNA".
 * Trattare "spółka", "akcyjna", "sp", "z", "o.o." come parole sostanziali
 * abbassa la precisione sotto soglia e fa perdere corrispondenze corrette.
 * L'elenco copre le forme più diffuse nei paesi serviti; è puramente additivo e
 * non può mai far combaciare due ragioni sociali con radici diverse.
 */
const LEGAL_FORM_TOKENS = new Set([
  // Polonia
  "spolka",
  "akcyjna",
  "sp",
  "z",
  "o",
  "oo",
  "zoo",
  "sa",
  "komandytowa",
  "komandytowo",
  // forme comuni in altri registri
  "ag",
  "gmbh",
  "kg",
  "kgaa",
  "se",
  "as",
  "a",
  "s",
  "nv",
  "bv",
  "plc",
  "ltd",
  "limited",
  "spa",
  "srl",
  "oy",
  "oyj",
  "ab",
  "aps",
  "kft",
  "zrt",
  "nyrt",
  "doo",
  "sarl",
]);

function contentTokens(normalized: string): string[] {
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !LEGAL_FORM_TOKENS.has(token));
}

export function gleifNameRelevance(query: string, candidate: string): number {
  const q = normalizeLegalName(query);
  const c = normalizeLegalName(candidate);
  if (!q || !c) return 0;
  if (q === c) return 100;

  // Confronto sui soli token sostanziali: le forme giuridiche non contano né a
  // favore né contro. Se una parte non ha token sostanziali, si ripiega
  // sull'intero nome per non dividere per zero.
  const qTokens = contentTokens(q);
  const cTokens = contentTokens(c);
  const qUsed = qTokens.length ? qTokens : q.split(/\s+/).filter(Boolean);
  const cUsed = cTokens.length ? cTokens : c.split(/\s+/).filter(Boolean);

  const common = qUsed.filter((token) => cUsed.includes(token)).length;
  const precision = common / Math.max(cUsed.length, 1);
  const recall = common / Math.max(qUsed.length, 1);
  const tokenScore = Math.round(100 * precision * recall);

  return tokenScore;
}

function normalizeLegalName(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      // Lettere con tratto/segno che NFD non scompone (polacco ł, croato đ,
      // norreno ø…): mappate a mano, altrimenti "spółka" resterebbe "spo ka".
      .replace(/ł/gi, "l")
      .replace(/đ/gi, "d")
      .replace(/ø/gi, "o")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  );
}

export function rankRelevantGleifMatches(query: string, matches: GleifMatch[]): GleifMatch[] {
  return matches
    .map((match) => ({ match, score: gleifNameRelevance(query, match.name) }))
    .filter(({ score }) => score >= 80)
    .sort((a, b) => b.score - a.score)
    .map(({ match }) => match);
}

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
          registeredAt: entity?.registeredAt?.id,
          address: formatAddress(entity?.legalAddress),
          status: entity?.status ? entity.status.toLowerCase() : undefined,
        };
      })
      .filter((match): match is GleifMatch => Boolean(match));

    return { ok: true, matches: rankRelevantGleifMatches(term, matches) };
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

export function numericRegistryId(registeredAs: string | undefined): string | undefined {
  if (!registeredAs) return undefined;
  const trimmed = registeredAs.trim();
  return /^[0-9]{6,16}$/.test(trimmed) ? trimmed : undefined;
}
