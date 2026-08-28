// ---------- INPI — Francia: Base SIRENE / RCS tramite API INPI ----------
// API INPI v1 (chiave gratuita da richiedere su inpi.fr, parametro api_key).
//   GET https://api.inpi.fr/entreprise/v1/entreprises?codeSiren={siren}&api_key={key}
//
// Il SIREN (9 cifre) si ricava dall'IVA francese:
//   FR + 2 cifre di controllo + SIREN (9 cifre) → le ultime 9 cifre.
//
// NOTE: il dominio non risolve da alcuni ambienti (DNS): in produzione
// (Vercel/AWS EU) è raggiungibile. L'adapter è best-effort e richiede
// la chiave INPI_KEY; senza chiave restituisce skipped.

import type { ActivityCode, CompanyProfile, Identifier } from "../types";
import { getCountry } from "../countries";

const INPI_BASE = "https://api.inpi.fr/entreprise/v1";

export interface InpiResult {
  ok: boolean;
  data?: CompanyProfile | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

/** FR + 2 (controllo) + SIREN (9) → SIREN. Accetta anche SIREN diretto (9 cifre). */
export function sirenFromVat(localVat: string): string | undefined {
  const digits = localVat.replace(/\D/g, "");
  if (digits.length === 9) return digits;
  if (digits.length === 11) return digits.slice(2);
  if (digits.length > 9) return digits.slice(-9);
  return undefined;
}

interface InpiAddress {
  voie?: string | undefined;
  complement?: string | undefined;
  codePostal?: string | undefined;
  libelleCommune?: string | undefined;
  libellePays?: string | undefined;
}

interface InpiSiret {
  numeroSiret?: string | undefined;
  adresse?: InpiAddress | undefined;
  activitePrincipale?: { code?: string | undefined; libelle?: string } | undefined;
  etatAdministratif?: string | undefined;
  dateCreation?: string | undefined;
}

interface InpiEntreprise {
  numeroSiren?: string | undefined;
  nomComplet?: string | undefined;
  denomination?: string | undefined;
  nom?: string | undefined;
  dateCreation?: string | undefined;
  etatAdministratif?: string | undefined;
  categorieJuridique?: { code?: string | undefined; libelle?: string } | undefined;
  nombreEmployes?: number | undefined;
  siege?: InpiSiret | undefined;
  siret?: InpiSiret[] | undefined;
}

const ETAT_LABEL: Record<string, string> = {
  A: "attiva",
  C: "cessata",
  J: "assoggettata a procedure concorsuali",
  N: "non operante",
  S: "sospesa",
};

export async function searchInpi(
  localVat: string,
  query: string,
  apiKey: string,
  timeoutMs = 12000,
): Promise<InpiResult> {
  if (!apiKey) return { ok: false, skipped: "chiave INPI non configurata (INPI_KEY)" };

  const siren = sirenFromVat(localVat) ?? sirenFromVat(query);
  if (!siren) {
    return {
      ok: false,
      skipped:
        "INPI richiede il SIREN (9 cifre): deriva automaticamente dall'IVA francese (es. FR12345678901)",
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `${INPI_BASE}/entreprises?codeSiren=${encodeURIComponent(siren)}&api_key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "TPbox-CompanyFinder/1.0" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "INPI: chiave non valida (401/403)" };
    if (!res.ok) return { ok: false, error: `INPI HTTP ${res.status}` };
    const json = (await res.json()) as InpiEntreprise;
    if (!json.numeroSiren && !json.nomComplet && !json.denomination) {
      return { ok: false, error: `INPI: nessuna azienda per SIREN ${siren}` };
    }

    const country = getCountry("FR")!;
    const siege = json.siege ?? json.siret?.[0];
    const addr = siege?.adresse;

    const identifiers: Identifier[] = [];
    if (json.numeroSiren) identifiers.push({ key: "SIREN", value: String(json.numeroSiren) });
    if (siege?.numeroSiret)
      identifiers.push({ key: "SIRET (sede)", value: String(siege.numeroSiret) });

    const activityCodes: ActivityCode[] = [];
    if (siege?.activitePrincipale?.code) {
      activityCodes.push({
        code: String(siege.activitePrincipale.code),
        label: siege.activitePrincipale.libelle
          ? String(siege.activitePrincipale.libelle).toLowerCase()
          : undefined,
      });
    }

    const profile: CompanyProfile = {
      name: json.denomination || json.nomComplet || json.nom,
      nameSource: "INPI (Base SIRENE)",
      country,
      registry: {
        name: "Registre du Commerce et des Sociétés / Base SIRENE",
        authority: "INPI",
        // exactOptionalPropertyTypes: id omesso quando manca il SIREN.
        ...(json.numeroSiren ? { id: `SIREN ${json.numeroSiren}` } : {}),
      },
      legalForm: json.categorieJuridique?.libelle
        ? String(json.categorieJuridique.libelle).toLowerCase()
        : undefined,
      status: ETAT_LABEL[String(json.etatAdministratif ?? "")] ?? json.etatAdministratif,
      registeredSince: json.dateCreation,
      address: addr
        ? [addr.voie, addr.codePostal, addr.libelleCommune].filter(Boolean).join(", ").toLowerCase()
        : undefined,
      employees: json.nombreEmployes,
      activityCodes: activityCodes.length ? activityCodes : undefined,
      identifiers: identifiers.length ? identifiers : undefined,
    };
    return { ok: true, data: profile };
  } catch (e) {
    const err = e as { name?: string | undefined; message?: string } | undefined;
    return {
      ok: false,
      error: err?.name === "AbortError" ? "INPI: timeout" : `INPI: ${err?.message ?? "errore"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
