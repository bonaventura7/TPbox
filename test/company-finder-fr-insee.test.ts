import { afterEach, describe, expect, it, vi } from "vitest";

import {
  sirenFromValue,
  siretFromValue,
  searchInseeSirene,
  uniteLegaleToProfile,
} from "../src/lib/company-finder/sources/insee-sirene";
import { runSearch } from "../src/lib/company-finder/orchestrator";

/**
 * Fixture: unité légale come da API Sirene v3 (https://api.insee.fr/api-sirene/3.11).
 */
const UNITE_LEGALE = {
  header: { statut: 200, message: "OK" },
  uniteLegale: {
    siren: "552178234",
    sigleUniteLegale: null,
    dateCreationUniteLegale: "1990-05-23",
    dateDernierTraitementUniteLegale: "2024-03-01",
    trancheEffectifsUniteLegale: "32",
    categorieEntreprise: "PME",
    periodesUniteLegale: [
      {
        dateFin: null,
        dateDebut: "2007-12-25",
        etatAdministratifUniteLegale: "A",
        denominationUniteLegale: "EXEMPLE SOCIETE",
        denominationUsuelle1UniteLegale: "EXEMPLE",
        categorieJuridiqueUniteLegale: "5710",
        activitePrincipaleUniteLegale: "62.01Z",
        nomenclatureActivitePrincipaleUniteLegale: "NAFRev2",
      },
      {
        dateFin: "2007-12-24",
        dateDebut: "1990-05-23",
        etatAdministratifUniteLegale: "A",
        denominationUniteLegale: "ANCIEN NOM",
        categorieJuridiqueUniteLegale: "5710",
        activitePrincipaleUniteLegale: "74.1A",
      },
    ],
  },
};

/** Fixture: ricerca établissements con la sede (etablissementSiege = true). */
const SIEGE = {
  header: { statut: 200, total: 2 },
  etablissements: [
    {
      siren: "552178234",
      nic: "00015",
      siret: "55217823400015",
      etablissementSiege: true,
      adresseEtablissement: {
        numeroVoieEtablissement: "5",
        typeVoieEtablissement: "RUE",
        libelleVoieEtablissement: "DE LA PAIX",
        codePostalEtablissement: "75002",
        libelleCommuneEtablissement: "PARIS 2",
      },
    },
    { siren: "552178234", nic: "00016", siret: "55217823400016", etablissementSiege: false },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("FR — normalizzazione degli identificativi Sirene", () => {
  it("ricava il SIREN da 9, 11 o 14 cifre", () => {
    expect(sirenFromValue("552178234")).toBe("552178234");
    // partita IVA francese: FR + 2 cifre di controllo + SIREN (9) → 11 cifre
    expect(sirenFromValue("44552178234")).toBe("552178234");
    // SIRET a 14 cifre: SIREN (9) + NIC (5)
    expect(sirenFromValue("55217823400015")).toBe("552178234");
    expect(sirenFromValue("55217823")).toBeUndefined();
  });

  it("riconosce il SIRET a 14 cifre", () => {
    expect(siretFromValue("55217823400015")).toBe("55217823400015");
    expect(siretFromValue("552178234")).toBeUndefined();
  });
});

describe("FR — mappatura dell'unité légale", () => {
  it("trasforma l'unité légale nella CompanyProfile", () => {
    const profile = uniteLegaleToProfile(UNITE_LEGALE.uniteLegale);
    expect(profile.name).toBe("EXEMPLE SOCIETE");
    expect(profile.nameSource).toContain("INSEE Sirene");
    expect(profile.legalForm).toBe("Société par actions simplifiée (SAS) (5710)");
    expect(profile.status).toBe("Attiva");
    expect(profile.registeredSince).toBe("1990-05-23");
    expect(profile.lastRegistryUpdate).toBe("2024-03-01");
    expect(profile.registry?.name).toBe("Répertoire Sirene (INSEE)");
    expect(profile.registry?.id).toBe("552178234");
    expect(profile.identifiers?.map((i) => i.key)).toEqual(["SIREN"]);
    expect(profile.activityCodes?.[0]?.code).toBe("62.01Z");
  });

  it("etichetta solo le categorie giuridiche note e lascia il codice per le altre", () => {
    const sas = uniteLegaleToProfile(UNITE_LEGALE.uniteLegale);
    expect(sas.legalForm).toContain("5710");

    const sarUnk = uniteLegaleToProfile({
      siren: "123456789",
      periodesUniteLegale: [
        { dateFin: null, dateDebut: "2020-01-01", categorieJuridiqueUniteLegale: "9999" },
      ],
    });
    expect(sarUnk.legalForm).toBe("Catégorie juridique 9999");
  });
});

describe("FR — ricerca anagrafica Sirene (fetch mockato)", () => {
  it("cerca per SIREN, passa la chiave nell'header e compone l'indirizzo dalla sede", async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, headers: new Headers(init?.headers) });
        return url.includes("/siret?") ? jsonResponse(SIEGE) : jsonResponse(UNITE_LEGALE);
      }),
    );
    const result = await searchInseeSirene("", "552178234", "test-key");
    expect(result.ok).toBe(true);
    expect(result.data?.name).toBe("EXEMPLE SOCIETE");
    expect(result.data?.address).toBe("5 RUE DE LA PAIX, 75002 PARIS 2");
    expect(result.data?.identifiers?.map((i) => i.key)).toEqual(["SIREN", "SIRET (sede)"]);

    expect(calls[0]?.url).toContain("/siren/552178234");
    expect(calls[0]?.headers.get("X-INSEE-Api-Key-Integration")).toBe("test-key");
    expect(calls.some((c) => c.url.includes("/siret?q=siren%3A552178234"))).toBe(true);
  });

  it("ricava il SIREN dalla partita IVA francese (11 cifre)", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        return url.includes("/siret?") ? jsonResponse(SIEGE) : jsonResponse(UNITE_LEGALE);
      }),
    );
    const result = await searchInseeSirene("", "44552178234", "test-key");
    expect(result.ok).toBe(true);
    expect(urls[0]).toContain("/siren/552178234");
  });

  it("cerca per denominazione quando non c'è un identificativo", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.includes("/siret?")) return jsonResponse(SIEGE);
        return jsonResponse({ header: { statut: 200 }, unitesLegales: [UNITE_LEGALE.uniteLegale] });
      }),
    );
    const result = await searchInseeSirene("EXEMPLE", "", "test-key");
    expect(result.ok).toBe(true);
    expect(result.data?.name).toBe("EXEMPLE SOCIETE");
    expect(urls[0]).toContain("/siren?q=denominationUniteLegale%3A%22EXEMPLE%22");
  });

  it("nessuna corrispondenza è un esito legittimo, non un errore", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ header: { statut: 404, message: "non trouvé" } }, 404)),
    );
    const result = await searchInseeSirene("", "999999999", "test-key");
    expect(result.ok).toBe(false);
    expect(result.notFound).toBe(true);
  });

  it("segnala la chiave non valida", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "Unauthorized" }, 401)),
    );
    const result = await searchInseeSirene("", "552178234", "test-key");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("chiave non valida");
  });

  it("senza un criterio utile non interroga affatto l'API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await searchInseeSirene("", "12", "test-key");
    expect(result.ok).toBe(false);
    expect(result.skipped).toContain("SIREN");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("FR — integrazione con l'orchestratore", () => {
  it("con la chiave configurata risolve l'anagrafica Sirene", async () => {
    vi.stubEnv("INSEE_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("api.insee.fr")) {
          return url.includes("/siret?") ? jsonResponse(SIEGE) : jsonResponse(UNITE_LEGALE);
        }
        return new Response("{}", { status: 500 });
      }),
    );
    const response = await runSearch({ query: "", vat: "552178234", country: "FR" });
    expect(response.found).toBe(true);
    expect(response.company?.name).toBe("EXEMPLE SOCIETE");
    const inseeSource = response.sources.find((s) => s.id === "insee-sirene");
    expect(inseeSource?.state).toBe("ok");
    expect(inseeSource?.detail).toContain("552178234");
  });

  it("senza chiave dichiara la fonte saltata e non interroga Sirene", async () => {
    vi.stubEnv("INSEE_API_KEY", "");
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return new Response("{}", { status: 500 });
      }),
    );
    await runSearch({ query: "", vat: "552178234", country: "FR" });
    expect(urls.some((u) => u.includes("api.insee.fr"))).toBe(false);
  });
});
