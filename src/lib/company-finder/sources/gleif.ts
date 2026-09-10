// ---------- GLEIF — risoluzione "nome società" → identificativo di registro ----------

import type { Iso2 } from "../types";

const BASE = "https://api.gleif.org/api/v1/lei-records";
const FUZZY_COMPLETIONS_URL = "https://api.gleif.org/api/v1/fuzzycompletions";

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

interface GleifAddress { addressLines?: string[] | undefined; city?: string | undefined; postalCode?: string | undefined; country?: string | undefined; }
interface GleifRegisteredAt { id?: string | undefined; other?: string | undefined; }
interface GleifEntity { legalName?: { name?: string | undefined } | undefined; legalAddress?: GleifAddress | undefined; registeredAs?: string | undefined; registeredAt?: GleifRegisteredAt | undefined; status?: string | undefined; }
interface GleifRecord { attributes?: { lei?: string | undefined; entity?: GleifEntity | undefined } | undefined; }
interface GleifFuzzyItem { attributes?: { value?: string | undefined } | undefined; relationships?: { "lei-records"?: { data?: { id?: string | undefined } | undefined } | undefined } | undefined; }

function formatAddress(address: GleifAddress | undefined): string | undefined {
  if (!address) return undefined;
  const parts = [...(address.addressLines ?? []), address.postalCode, address.city].filter((part): part is string => Boolean(part && part.trim()));
  return parts.length > 0 ? parts.join(", ").toLowerCase() : undefined;
}

function mapRecordToMatch(record: GleifRecord | undefined): GleifMatch | undefined {
  const entity = record?.attributes?.entity;
  const lei = record?.attributes?.lei;
  const legalName = entity?.legalName?.name;
  const iso = entity?.legalAddress?.country;
  if (!lei || !legalName || !iso) return undefined;
  return { lei, name: legalName, country: iso.toUpperCase() as Iso2, registeredAs: entity?.registeredAs, registeredAt: entity?.registeredAt?.id, address: formatAddress(entity?.legalAddress), status: entity?.status ? entity.status.toLowerCase() : undefined };
}

async function fetchGleifJson(url: string, timeoutMs: number): Promise<{ ok: boolean; json?: unknown | undefined; error?: string | undefined }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: "application/vnd.api+json" }, signal: ctrl.signal });
    if (!res.ok) return { ok: false, error: `GLEIF HTTP ${res.status}` };
    return { ok: true, json: await res.json() };
  } catch (e) {
    const err = e as { name?: string | undefined; message?: string | undefined };
    return { ok: false, error: err?.name === "AbortError" ? "GLEIF: timeout" : (err?.message ?? "GLEIF: errore di rete") };
  } finally { clearTimeout(timer); }
}

const LEGAL_FORM_TOKENS = new Set(["spolka","akcyjna","sp","z","o","oo","zoo","sa","komandytowa","komandytowo","ag","gmbh","kg","kgaa","se","as","a","s","nv","bv","plc","ltd","limited","spa","srl","oy","oyj","ab","aps","kft","zrt","nyrt","doo","sarl"]);

function contentTokens(normalized: string): string[] { return normalized.split(/\s+/).filter(Boolean).filter((token) => !LEGAL_FORM_TOKENS.has(token)); }

function normalizeLegalName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/gi, "l").replace(/đ/gi, "d").replace(/ø/gi, "o").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function gleifNameRelevance(query: string, candidate: string): number {
  const q = normalizeLegalName(query); const c = normalizeLegalName(candidate);
  if (!q || !c) return 0; if (q === c) return 100;
  const qTokens = contentTokens(q); const cTokens = contentTokens(c);
  const qUsed = qTokens.length ? qTokens : q.split(/\s+/).filter(Boolean); const cUsed = cTokens.length ? cTokens : c.split(/\s+/).filter(Boolean);
  const common = qUsed.filter((token) => cUsed.includes(token)).length;
  return Math.round(100 * (common / Math.max(cUsed.length, 1)) * (common / Math.max(qUsed.length, 1)));
}

export function rankRelevantGleifMatches(query: string, matches: GleifMatch[]): GleifMatch[] {
  return matches.map((match) => ({ match, score: gleifNameRelevance(query, match.name) })).filter(({ score }) => score >= 80).sort((a, b) => b.score - a.score).map(({ match }) => match);
}

export function gleifPrefixRelevance(query: string, candidate: string): number {
  const q = normalizeLegalName(query); const c = normalizeLegalName(candidate);
  if (!q || !c) return 0; if (q === c) return 100;
  const qTokens = contentTokens(q); const cTokens = contentTokens(c);
  const qUsed = qTokens.length ? qTokens : q.split(/\s+/).filter(Boolean); const cUsed = cTokens.length ? cTokens : c.split(/\s+/).filter(Boolean);
  let common = 0;
  for (const qt of qUsed) if (cUsed.some((ct) => qt === ct || ct.startsWith(qt) || qt.startsWith(ct))) common += 1;
  return Math.round(100 * (common / Math.max(cUsed.length, 1)) * (common / Math.max(qUsed.length, 1)));
}

async function searchGleifFuzzy(term: string, country: string, timeoutMs: number): Promise<GleifResult> {
  const params = new URLSearchParams({ field: "entity.legalName", q: term });
  const completions = await fetchGleifJson(`${FUZZY_COMPLETIONS_URL}?${params.toString()}`, timeoutMs);
  if (!completions.ok) return { ok: true, matches: [] };
  const items = ((completions.json as { data?: GleifFuzzyItem[] | undefined })?.data ?? []).filter(Boolean);
  const candidates = items.map((item) => ({ lei: item.relationships?.["lei-records"]?.data?.id, value: item.attributes?.value })).filter((c): c is { lei: string; value: string } => Boolean(c.lei && c.value)).slice(0, 5);
  const matches: GleifMatch[] = [];
  for (const candidate of candidates) {
    const record = await fetchGleifJson(`${BASE}/${candidate.lei}`, timeoutMs);
    if (!record.ok) continue;
    const match = mapRecordToMatch((record.json as { data?: GleifRecord } | undefined)?.data);
    if (match) matches.push(match);
  }
  const wanted = country ? country.toUpperCase() : undefined;
  return { ok: true, matches: matches.filter((match) => !wanted || match.country === wanted).map((match) => ({ match, score: gleifPrefixRelevance(term, match.name) })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).map(({ match }) => match) };
}

export async function searchGleif(name: string, country: string, timeoutMs = 10000): Promise<GleifResult> {
  const term = name.trim();
  if (term.length < 3) return { ok: false, matches: [], error: "nome troppo corto" };
  const params = new URLSearchParams(); params.set("filter[entity.legalName]", term); params.set("page[size]", "5"); if (country) params.set("filter[entity.legalAddress.country]", country.toUpperCase());
  const exact = await fetchGleifJson(`${BASE}?${params.toString()}`, timeoutMs);
  if (!exact.ok) return { ok: false, matches: [], error: exact.error };
  const records = (exact.json as { data?: GleifRecord[] | undefined })?.data ?? [];
  const ranked = rankRelevantGleifMatches(term, records.map(mapRecordToMatch).filter((match): match is GleifMatch => Boolean(match)));
  if (ranked.length > 0) return { ok: true, matches: ranked };
  return searchGleifFuzzy(term, country, timeoutMs);
}

export function numericRegistryId(registeredAs: string | undefined): string | undefined {
  if (!registeredAs) return undefined;
  const trimmed = registeredAs.trim();
  return /^[0-9]{6,16}$/.test(trimmed) ? trimmed : undefined;
}
