// ---------- Francia: Recherche d'entreprises (API pubblica dello Stato) ----------
// https://recherche-entreprises.api.gouv.fr — gratuita, senza chiave, senza
// registrazione. Da una denominazione restituisce in UNA sola chiamata: SIREN,
// denominazione ufficiale, sede, attività, dirigenti e — questo è il punto —
// il blocco `finances` con chiffre d'affaires e résultat net per esercizio.
//
// Non è il bilancio completo (mancano stato patrimoniale e patrimonio netto:
// per quelli serve l'API INPI RNE, che vuole un account). È però l'unica fonte
// francese che risponde a un server, senza credenziali, partendo dal nome.

import { getCountry } from "../countries";
import type { CompanyProfile, Financials, FinancialYear, Officer } from "../types";

const BASE = "https://recherche-entreprises.api.gouv.fr/search";

export interface RechercheResult {
  ok: boolean;
  profile?: CompanyProfile | undefined;
  financials?: Financials | undefined;
  error?: string | undefined;
}

interface ApiSiege {
  adresse?: string | undefined;
  code_postal?: string | undefined;
  libelle_commune?: string | undefined;
  siret?: string | undefined;
}

interface ApiDirigeant {
  nom?: string | undefined;
  prenoms?: string | undefined;
  qualite?: string | undefined;
  denomination?: string | undefined;
}

interface ApiFinance {
  ca?: number | undefined;
  resultat_net?: number | undefined;
}

interface ApiCompany {
  siren?: string | undefined;
  nom_complet?: string | undefined;
  nom_raison_sociale?: string | undefined;
  siege?: ApiSiege | undefined;
  activite_principale?: string | undefined;
  etat_administratif?: string | undefined;
  date_creation?: string | undefined;
  nature_juridique?: string | undefined;
  dirigeants?: ApiDirigeant[] | undefined;
  finances?: Record<string, ApiFinance> | undefined;
}

/** SIREN dalle 9 cifre digitate o dalle ultime 9 dell'IVA francese (FR xx SIREN). */
export function sirenFromInput(localVat: string): string | undefined {
  const digits = localVat.replace(/\D/g, "");
  if (/^\d{9}$/.test(digits)) return digits;
  if (/^\d{11}$/.test(digits)) return digits.slice(2);
  return undefined;
}

function toFinancials(finances: Record<string, ApiFinance> | undefined): Financials | undefined {
  if (!finances) return undefined;
  const years: FinancialYear[] = Object.entries(finances)
    .filter(([year]) => /^\d{4}$/.test(year))
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([year, values]) => {
      const row: FinancialYear = { periodLabel: `Esercizio ${year}`, currency: "EUR" };
      if (typeof values.ca === "number") row.revenue = values.ca;
      if (typeof values.resultat_net === "number") row.netIncome = values.resultat_net;
      return row;
    });
  if (years.length === 0) return undefined;
  return {
    available: true,
    currency: "EUR",
    years,
    source: "Recherche d'entreprises — dati INPI/DGFiP",
    note:
      "Cifra d'affari e risultato netto dai conti depositati, pubblicati dall'API di Stato francese. " +
      "Stato patrimoniale e patrimonio netto non sono esposti da questa fonte: il documento integrale " +
      "resta sul registro nazionale (INPI), che richiede un account.",
  };
}

function toProfile(company: ApiCompany): CompanyProfile | undefined {
  const siren = company.siren;
  const name = company.nom_complet ?? company.nom_raison_sociale;
  if (!siren || !name) return undefined;

  const officers: Officer[] = (company.dirigeants ?? []).slice(0, 8).map((person) => {
    const label = person.denomination ?? [person.prenoms, person.nom].filter(Boolean).join(" ");
    const officer: Officer = { role: person.qualite ?? "dirigente" };
    if (label && label.trim()) officer.name = label.trim();
    return officer;
  });

  const profile: CompanyProfile = {
    name,
    nameSource: "Recherche d'entreprises (Stato francese)",
    country: getCountry("FR")!,
    registry: { name: "RNE / Base SIRENE", authority: "INPI — INSEE", id: `SIREN ${siren}` },
    identifiers: [{ key: "SIREN", value: siren }],
  };
  if (company.nature_juridique) profile.legalForm = company.nature_juridique;
  if (company.etat_administratif) {
    profile.status = company.etat_administratif === "A" ? "attiva" : "cessata";
  }
  if (company.date_creation) profile.registeredSince = company.date_creation;
  if (company.siege?.adresse) profile.address = company.siege.adresse.toLowerCase();
  if (company.activite_principale) {
    profile.activityCodes = [{ code: company.activite_principale, label: "codice NAF" }];
  }
  if (company.siege?.siret)
    profile.identifiers?.push({ key: "SIRET (sede)", value: company.siege.siret });
  if (officers.length > 0) profile.officers = officers;
  return profile;
}

export async function searchRechercheEntreprises(
  query: string,
  localVat: string,
  timeoutMs = 12000,
): Promise<RechercheResult> {
  const siren = sirenFromInput(localVat);
  const term = siren ?? query.trim();
  if (!term) return { ok: false, error: "serve la ragione sociale oppure il SIREN" };

  const url = `${BASE}?q=${encodeURIComponent(term)}&per_page=3&page=1`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return { ok: false, error: `Recherche d'entreprises HTTP ${res.status}` };

    const json = (await res.json()) as { results?: ApiCompany[] | undefined };
    const results = json.results ?? [];
    // Con il SIREN la corrispondenza è esatta; col nome si prende il primo
    // risultato, che l'API ordina già per pertinenza.
    const company = siren ? results.find((c) => c.siren === siren) : results[0];
    if (!company) return { ok: false, error: "nessuna impresa francese corrisponde" };

    const profile = toProfile(company);
    if (!profile) return { ok: false, error: "risposta priva di SIREN o denominazione" };
    return { ok: true, profile, financials: toFinancials(company.finances) };
  } catch (e) {
    const err = e as { name?: string | undefined; message?: string | undefined };
    return {
      ok: false,
      error:
        err?.name === "AbortError"
          ? "Recherche d'entreprises: timeout"
          : (err?.message ?? "Recherche d'entreprises: errore di rete"),
    };
  } finally {
    clearTimeout(timer);
  }
}
