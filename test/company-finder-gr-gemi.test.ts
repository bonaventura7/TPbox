import { afterEach, describe, expect, it, vi } from "vitest";

import {
  afmFromInput,
  gemiCompanyToProfile,
  gemiFromInput,
  searchGemiProfile,
} from "../src/lib/company-finder/sources/gemi-opendata";
import { runSearch } from "../src/lib/company-finder/orchestrator";

/**
 * Fixture: una scheda GEMI completa come da Swagger dell'OpenData ΓΕΜΗ
 * (https://opendata-api.businessportal.gr/opendata/docs/).
 */
const GEMI_COMPANY = {
  arGemi: 1797901000,
  afm: "094014270",
  coNameEl: "ΠΑΡΑΔΕΙΓΜΑ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ",
  coNamesEn: ["PARADEIGMA S.A."],
  legalType: { id: 1, descr: "Ανώνυμη Εταιρία", descrEn: "Société Anonyme" },
  status: { id: 1, descr: "ΕΝΕΡΓΗ", descrEn: "ACTIVE", isActive: true },
  incorporationDate: "2001-05-04",
  lastStatusChange: "2024-01-15",
  street: "Λεωφ. Κηφισίας",
  streetNumber: "100",
  zipCode: "15125",
  city: "Μαρούσι",
  email: "info@example.gr",
  url: "https://www.example.gr",
  capital: [{ capitalStock: 500000, currency: "EUR" }],
  activities: [{ activity: { id: "46.19", descr: "Αντιπρόσωποι" }, type: "ΚΥΡΙΑ" }],
  persons: [{ personName: "ΝΙΚΟΣ ΠΑΠΑΔΟΠΟΥΛΟΣ", role: "Διαχειριστής", dtFrom: "2018-01-01" }],
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

describe("GR — normalizzazione degli identificativi ΓΕΜΗ", () => {
  it("riconosce il numero ΓΕΜΗ a 10 cifre", () => {
    expect(gemiFromInput("1797901000")).toBe("1797901000");
    expect(gemiFromInput("ΓΕΜΗ 1797901000")).toBe("1797901000");
    expect(gemiFromInput("179790100")).toBeUndefined();
  });

  it("riconosce l'ΑΦΜ a 9 cifre, anche con prefisso EL/GR", () => {
    expect(afmFromInput("094014270")).toBe("094014270");
    expect(afmFromInput("EL094014270")).toBe("094014270");
    expect(afmFromInput("GR094014270")).toBe("094014270");
    expect(afmFromInput("09401427")).toBeUndefined();
  });
});

describe("GR — mappatura della scheda ΓΕΜΗ", () => {
  it("trasforma la scheda API nella CompanyProfile", () => {
    const profile = gemiCompanyToProfile(GEMI_COMPANY);
    expect(profile.name).toBe("ΠΑΡΑΔΕΙΓΜΑ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ");
    expect(profile.nameSource).toContain("GEMI");
    expect(profile.vat?.number).toBe("EL094014270");
    expect(profile.legalForm).toBe("Société Anonyme");
    expect(profile.status).toBe("Attiva");
    expect(profile.registeredSince).toBe("2001-05-04");
    expect(profile.address).toContain("Μαρούσι");
    expect(profile.capital).toBe("500000 EUR");
    expect(profile.identifiers?.map((i) => i.key)).toEqual(["Αρ. Γ.Ε.ΜΗ.", "ΑΦΜ"]);
    expect(profile.registry?.id).toBe("1797901000");
    expect(profile.activityCodes?.[0]?.code).toBe("46.19");
    expect(profile.officers?.[0]?.name).toBe("ΝΙΚΟΣ ΠΑΠΑΔΟΠΟΥΛΟΣ");
  });
});

describe("GR — ricerca anagrafica ΓΕΜΗ (fetch mockato)", () => {
  it("cerca per Αρ. ΓΕΜΗ e passa l'api_key nell'header", async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), headers: new Headers(init?.headers) });
        return jsonResponse({ searchMetadata: { totalCount: 1 }, searchResults: [GEMI_COMPANY] });
      }),
    );
    const result = await searchGemiProfile("", "1797901000", "test-key");
    expect(result.ok).toBe(true);
    expect(result.data?.name).toBe("ΠΑΡΑΔΕΙΓΜΑ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ");
    expect(calls[0]?.url).toContain("/companies?arGemi=1797901000");
    expect(calls[0]?.headers.get("api_key")).toBe("test-key");
  });

  it("cerca per ΑΦΜ a 9 cifre", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return jsonResponse({ searchMetadata: { totalCount: 1 }, searchResults: [GEMI_COMPANY] });
      }),
    );
    const result = await searchGemiProfile("", "EL094014270", "test-key");
    expect(result.ok).toBe(true);
    expect(urls[0]).toContain("/companies?afm=094014270");
  });

  it("cerca per denominazione quando non c'è un identificativo", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return jsonResponse({ searchMetadata: { totalCount: 1 }, searchResults: [GEMI_COMPANY] });
      }),
    );
    const result = await searchGemiProfile("PARADEIGMA", "", "test-key");
    expect(result.ok).toBe(true);
    expect(urls[0]).toContain("/companies?name=PARADEIGMA");
  });

  it("recupera la scheda completa quando la ricerca restituisce solo il numero", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        return url.includes("/companies/")
          ? jsonResponse(GEMI_COMPANY)
          : jsonResponse({
              searchMetadata: { totalCount: 1 },
              searchResults: [{ arGemi: 1797901000 }],
            });
      }),
    );
    const result = await searchGemiProfile("", "1797901000", "test-key");
    expect(result.ok).toBe(true);
    expect(result.data?.name).toBe("ΠΑΡΑΔΕΙΓΜΑ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ");
    expect(urls.some((u) => u.includes("/companies/1797901000"))).toBe(true);
  });

  it("nessuna corrispondenza è un esito legittimo, non un errore", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ searchMetadata: { totalCount: 0 }, searchResults: [] })),
    );
    const result = await searchGemiProfile("", "094014270", "test-key");
    expect(result.ok).toBe(false);
    expect(result.notFound).toBe(true);
  });

  it("senza un criterio utile non interroga affatto l'API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await searchGemiProfile("", "12", "test-key");
    expect(result.ok).toBe(false);
    expect(result.skipped).toContain("ΑΦΜ");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propaga l'errore HTTP dell'API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "boom" }, 500)),
    );
    const result = await searchGemiProfile("", "094014270", "test-key");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });
});

describe("GR — integrazione con l'orchestratore", () => {
  it("con la chiave configurata risolve l'anagrafica e non interroga il VIES", async () => {
    vi.stubEnv("GEMI_API_KEY", "test-key");
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return jsonResponse({ searchMetadata: { totalCount: 1 }, searchResults: [GEMI_COMPANY] });
      }),
    );
    const response = await runSearch({ query: "", vat: "1797901000", country: "GR" });
    expect(response.found).toBe(true);
    expect(response.company?.name).toBe("ΠΑΡΑΔΕΙΓΜΑ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ");
    expect(response.company?.registry?.id).toBe("1797901000");
    expect(urls.some((u) => u.includes("opendata-api.businessportal.gr"))).toBe(true);
    // Il numero ΓΕΜΗ non è una partita IVA: mai inviato al VIES.
    expect(urls.some((u) => /ec\.europa\.eu/i.test(u))).toBe(false);
    expect(response.officialPage?.mode).toBe("external");
  });

  it("senza chiave dichiara la fonte saltata e non inventa dati", async () => {
    vi.stubEnv("GEMI_API_KEY", "");
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return jsonResponse({});
      }),
    );
    const response = await runSearch({ query: "", vat: "1797901000", country: "GR" });
    expect(response.found).toBe(false);
    expect(urls).toHaveLength(0);
    const gemiSource = response.sources.find((s) => s.id === "gemi-opendata");
    expect(gemiSource?.state).toBe("skipped");
    expect(gemiSource?.detail).toContain("GEMI_API_KEY");
  });
});
