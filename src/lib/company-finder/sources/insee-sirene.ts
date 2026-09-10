// ---------- Francia: INSEE — Répertoire Sirene (API Sirene open data) ----------
// Fonte anagrafica UFFICIALE delle imprese francesi: il répertoire Sirene
// gestito dall'INSEE (SIREN/SIRET, unité légale + établissements, dal 1973).
// Gratuita in Licence Ouverte 2.0, ma con autenticazione: serve una chiave di
// integrazione statica ottenuta dal portale https://portail-api.insee.fr
// (conto → applicazione → sottoscrizione all'API Sirene, piano "Public").
// Il VECCHIO portale (OAuth Consumer Key/Secret) è chiuso dal 10/09/2025:
// la nuova chiave è statica e va passata nell'header HTTP
// `X-INSEE-Api-Key-Integration` (NON in Authorization, NON come bearer token).
//
//   Base:  https://api.insee.fr/api-sirene/3.11
//   GET /siren/{siren}          → unité légale completa (denominazione, forma
//                                 giuridica, NAF, stato, date, effettivi)
//   GET /siret/{siret}          → établissement (indirizzo, stato, NAF)
//   GET /siren?q=...            → ricerca multicriteri (es. per denominazione)
//   GET /siret?q=...            → ricerca multicriteri sugli établissements
//
// Limite: 30 richieste/minuto per gli usi open data. I bilanci NON sono in
// Sirene: per la Francia restano le fonti già attive (Recherche d'entreprises,
// Pappers, INPI). Questo adapter fornisce l'anagrafica canonica SIRENE.

import type { ActivityCode, CompanyProfile, Identifier } from "../types";
import { getCountry } from "../countries";

export const INSEE_SIRENE_BASE = "https://api.insee.fr/api-sirene/3.11";
export const INSEE_API_KEY_HEADER = "X-INSEE-Api-Key-Integration";
export const INSEE_API_KEY_ENV = "INSEE_API_KEY";
export const INSEE_PORTAL = "https://portail-api.insee.fr/catalog/all";

const DEFAULT_TIMEOUT_MS = 15_000;

/** Chiave API facoltativa, letta in modo difensivo (edge runtime senza `process`). */
export function inseeApiKey(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const value = env?.[INSEE_API_KEY_ENV]?.trim();
  return value ? value : undefined;
}

// ---------- Normalizzazione degli identificativi ----------

/**
 * SIREN (9 cifre) da un input generico:
 *  · 9 cifre        → SIREN diretto
 *  · 11 cifre       → partita IVA francese (FR + 2 cifre di controllo + SIREN)
 *  · 14 cifre       → SIRET (SIREN + NIC), si tengono le prime 9
 */
export function sirenFromValue(value: string): string | undefined {
  const digits = value.replace(/\D/g, "");
  if (/^\d{9}$/.test(digits)) return digits;
  if (/^\d{11}$/.test(digits)) return digits.slice(2);
  if (/^\d{14}$/.test(digits)) return digits.slice(0, 9);
  return undefined;
}

/** SIRET (14 cifre) valido. */
export function siretFromValue(value: string): string | undefined {
  const digits = value.replace(/\D/g, "");
  return /^\d{14}$/.test(digits) ? digits : undefined;
}

// ---------- Modelli del payload (sottoinsieme dello Swagger Sirene v3) ----------

interface InseePeriode {
  dateDebut?: string | undefined;
  dateFin?: string | null | undefined;
  etatAdministratifUniteLegale?: string | undefined;
  nomUniteLegale?: string | undefined;
  nomUsageUniteLegale?: string | undefined;
  denominationUniteLegale?: string | undefined;
  denominationUsuelle1UniteLegale?: string | undefined;
  categorieJuridiqueUniteLegale?: string | undefined;
  activitePrincipaleUniteLegale?: string | undefined;
  nomenclatureActivitePrincipaleUniteLegale?: string | undefined;
}

interface InseeAdresse {
  complementAdresseEtablissement?: string | undefined;
  numeroVoieEtablissement?: string | undefined;
  typeVoieEtablissement?: string | undefined;
  libelleVoieEtablissement?: string | undefined;
  codePostalEtablissement?: string | undefined;
  libelleCommuneEtablissement?: string | undefined;
  libelleCommuneEtrangerEtablissement?: string | undefined;
  libellePaysEtrangerEtablissement?: string | undefined;
  distributionSpecialeEtablissement?: string | undefined;
}

interface InseeEtablissement {
  siren?: string | undefined;
  nic?: string | undefined;
  siret?: string | undefined;
  etablissementSiege?: boolean | undefined;
  adresseEtablissement?: InseeAdresse | undefined;
}

interface InseeUniteLegale {
  siren?: string | undefined;
  sigleUniteLegale?: string | undefined;
  dateCreationUniteLegale?: string | undefined;
  dateDernierTraitementUniteLegale?: string | undefined;
  trancheEffectifsUniteLegale?: string | undefined;
  categorieEntreprise?: string | undefined;
  periodesUniteLegale?: InseePeriode[] | undefined;
}

interface InseeResponse {
  header?: {
    statut?: number | undefined;
    message?: string | undefined;
    total?: number | undefined;
  };
  uniteLegale?: InseeUniteLegale | undefined;
  unitesLegales?: InseeUniteLegale[] | undefined;
  etablissement?: InseeEtablissement | undefined;
  etablissements?: InseeEtablissement[] | undefined;
}

export interface InseeResult {
  ok: boolean;
  data?: CompanyProfile | undefined;
  notFound?: boolean | undefined;
  skipped?: string | undefined;
  error?: string | undefined;
}

class InseeHttpError extends Error {
  constructor(readonly status: number) {
    super(`INSEE Sirene HTTP ${status}`);
    this.name = "InseeHttpError";
  }
}

function textOr(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** La "periodesUniteLegale" contiene le occorrenze correnti (dateFin null) e quelle storiche. */
function currentPeriod(u: InseeUniteLegale | undefined): InseePeriode | undefined {
  const periods = u?.periodesUniteLegale ?? [];
  return periods.find((p) => !p.dateFin) ?? periods[periods.length - 1];
}

const ETAT_LABEL: Record<string, string> = {
  A: "Attiva",
  C: "Cessata",
};

/**
 * Solo le categorie giuridiche più comuni sono etichettate; le altre restano
 * esposte col codice numerico, senza inventare una descrizione.
 */
const CJ_LABEL: Record<string, string> = {
  "1000": "Entrepreneur individuel",
  "5410": "Société anonyme (SA)",
  "5510": "Société anonyme à directoire",
  "5520": "Société à responsabilité limitée (SARL)",
  "5710": "Société par actions simplifiée (SAS)",
};

function formatAdresse(adresse: InseeAdresse | undefined): string | undefined {
  if (!adresse) return undefined;
  if (adresse.libellePaysEtrangerEtablissement) {
    return [
      [
        adresse.numeroVoieEtablissement,
        adresse.typeVoieEtablissement,
        adresse.libelleVoieEtablissement,
      ]
        .filter(textOr)
        .join(" "),
      adresse.libelleCommuneEtrangerEtablissement,
      adresse.libellePaysEtrangerEtablissement,
    ]
      .filter(textOr)
      .join(", ");
  }
  return [
    [
      adresse.numeroVoieEtablissement,
      adresse.typeVoieEtablissement,
      adresse.libelleVoieEtablissement,
    ]
      .filter(textOr)
      .join(" "),
    adresse.complementAdresseEtablissement,
    [adresse.codePostalEtablissement, adresse.libelleCommuneEtablissement].filter(textOr).join(" "),
    adresse.distributionSpecialeEtablissement,
  ]
    .filter(textOr)
    .join(", ");
}

// ---------- Mapping payload → scheda società ----------

export function uniteLegaleToProfile(u: InseeUniteLegale): CompanyProfile {
  const country = getCountry("FR");
  if (!country) throw new Error("Francia assente dal catalogo paesi");

  const period = currentPeriod(u);
  const name =
    textOr(period?.denominationUniteLegale) ??
    textOr(period?.nomUniteLegale) ??
    textOr(u.sigleUniteLegale);
  const cj = textOr(period?.categorieJuridiqueUniteLegale);
  const legalForm = cj
    ? CJ_LABEL[cj]
      ? `${CJ_LABEL[cj]} (${cj})`
      : `Catégorie juridique ${cj}`
    : undefined;
  const etat = textOr(period?.etatAdministratifUniteLegale);
  const status = etat ? (ETAT_LABEL[etat] ?? etat) : undefined;

  const identifiers: Identifier[] = [];
  if (u.siren) identifiers.push({ key: "SIREN", value: u.siren });

  const activityCodes: ActivityCode[] = [];
  const naf = textOr(period?.activitePrincipaleUniteLegale);
  if (naf) activityCodes.push({ code: naf });

  return {
    name,
    nameSource: "INSEE Sirene (répertoire Sirene)",
    country,
    registry: {
      name: "Répertoire Sirene (INSEE)",
      authority: "INSEE",
      ...(u.siren ? { id: u.siren } : {}),
    },
    legalForm,
    status,
    registeredSince: textOr(u.dateCreationUniteLegale),
    lastRegistryUpdate: textOr(u.dateDernierTraitementUniteLegale),
    activityCodes: activityCodes.length ? activityCodes : undefined,
    identifiers,
  };
}

// ---------- Chiamate all'API ----------

async function inseeFetch<T>(
  pathWithQuery: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(`${INSEE_SIRENE_BASE}${pathWithQuery}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      [INSEE_API_KEY_HEADER]: apiKey,
      "User-Agent": "TPBox-Company-Finder/1.0",
    },
    signal,
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    throw new InseeHttpError(response.status);
  }
  if (response.status === 429) throw new InseeHttpError(429);
  if (!response.ok) throw new InseeHttpError(response.status);
  return (await response.json()) as T;
}

/** Unité légale per SIREN; `undefined` se non esiste (404). */
async function getUniteLegale(
  siren: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<InseeUniteLegale | undefined> {
  try {
    const payload = await inseeFetch<InseeResponse>(`/siren/${siren}`, apiKey, signal);
    return payload.uniteLegale;
  } catch (error) {
    if (error instanceof InseeHttpError && error.status === 404) return undefined;
    throw error;
  }
}

/** Ricerca per denominazione (sintassi `q=denominationUniteLegale:"..."`). */
async function searchUniteLegaleByName(
  name: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<InseeUniteLegale | undefined> {
  const escaped = name.replace(/"/g, '\\"');
  const q = `denominationUniteLegale:"${escaped}"`;
  const payload = await inseeFetch<InseeResponse>(
    `/siren?q=${encodeURIComponent(q)}&nombre=1`,
    apiKey,
    signal,
  );
  return (payload.unitesLegales ?? [])[0];
}

/** Établissement sede (NIC 000xx) associato al SIREN, per l'indirizzo. */
async function findSiege(
  siren: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<InseeEtablissement | undefined> {
  const payload = await inseeFetch<InseeResponse>(
    `/siret?q=${encodeURIComponent(`siren:${siren}`)}&nombre=20`,
    apiKey,
    signal,
  );
  const list = Array.isArray(payload.etablissements) ? payload.etablissements : [];
  return (
    list.find((e) => e.etablissementSiege === true) ??
    list.find((e) => e.nic && /^000\d{2}$/.test(e.nic))
  );
}

/**
 * Ricerca anagrafica Sirene: per SIREN/SIRET (dalla partita IVA o dal campo di
 * ricerca) oppure per denominazione (best-effort). La sede fornisce l'indirizzo.
 */
export async function searchInseeSirene(
  query: string,
  localVat: string,
  apiKey: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<InseeResult> {
  if (!apiKey) {
    return { ok: false, skipped: "chiave INSEE non configurata (INSEE_API_KEY)" };
  }

  const name = query.trim();
  const siren = sirenFromValue(localVat) ?? sirenFromValue(name);
  if (!siren && name.length < 3) {
    return {
      ok: false,
      skipped:
        "servi il SIREN (9 cifre), il SIRET (14 cifre) o la denominazione per la ricerca Sirene",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const uniteLegale = siren
      ? await getUniteLegale(siren, apiKey, controller.signal)
      : await searchUniteLegaleByName(name, apiKey, controller.signal);
    if (!uniteLegale) return { ok: false, notFound: true };

    const profile = uniteLegaleToProfile(uniteLegale);

    // Indirizzo dalla sede: recupero best-effort, la scheda resta valida anche
    // se il secondo giro non riesce (es. quota raggiunta).
    if (uniteLegale.siren) {
      const siege = await findSiege(uniteLegale.siren, apiKey, controller.signal).catch(
        () => undefined,
      );
      if (siege) {
        const address = formatAdresse(siege.adresseEtablissement);
        if (address) profile.address = address;
        if (siege.siret) {
          profile.identifiers = [
            ...(profile.identifiers ?? []),
            { key: "SIRET (sede)", value: siege.siret },
          ];
        }
      }
    }

    return { ok: true, data: profile };
  } catch (error) {
    const err = error as { name?: string | undefined; message?: string | undefined };
    if (err?.name === "AbortError") return { ok: false, error: "INSEE Sirene: timeout" };
    if (error instanceof InseeHttpError && error.status === 429) {
      return { ok: false, error: "INSEE Sirene: limite di 30 richieste/minuto superato" };
    }
    if (error instanceof InseeHttpError && (error.status === 401 || error.status === 403)) {
      return { ok: false, error: "INSEE Sirene: chiave non valida o non autorizzata (401/403)" };
    }
    return { ok: false, error: err?.message ?? "INSEE Sirene non raggiungibile" };
  } finally {
    clearTimeout(timer);
  }
}
