import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifyLbrPage,
  luAdapter,
  normalizeLuIdentifiers,
} from "../src/lib/company-finder/registry/lu-lbr.server";
import { ALL_COUNTRIES } from "../src/lib/company-finder/countries";
import { BROWSER_ONLY_PAGES, CONSULT_PAGES, isCovered } from "../src/lib/company-finder/coverage";
import { officialPageFor } from "../src/lib/company-finder/official-pages";
import { runSearch } from "../src/lib/company-finder/orchestrator";

/**
 * Il portale LBR consente la ricerca gratuita, ma lo scarico dei conti annuali
 * richiede un account (LuxTrust/eIDAS) e i suoi termini d'uso vietano il
 * download automatizzato: si dichiara la restrizione, non si aggira.
 */
const SEARCH_PAGE_WITH_LOGIN = `<!DOCTYPE html><html lang="fr"><body>
<header>Luxembourg Business Registers</header>
<a href="/mjrcs-web-front/login">Se connecter avec LuxTrust</a>
<form action="/mjrcs-web-front/consult-company" method="get">
<input name="companyName" />
</form>
<p>Le téléchargement des documents nécessite un compte.</p>
</body></html>`;

/** Fixture: portale momentaneamente non raggiungibile / pagina inattesa. */
const UNKNOWN_PAGE = `<!DOCTYPE html><html><body><h1>Maintenance</h1></body></html>`;

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("LU — normalizzazione degli identificativi", () => {
  it("riconosce il numero RCS con o senza separatori", () => {
    expect(normalizeLuIdentifiers({ vat: "B60814" }).rcs).toBe("B60814");
    expect(normalizeLuIdentifiers({ vat: "B-60 814" }).rcs).toBe("B60814");
    expect(normalizeLuIdentifiers({ vat: "b.82454" }).rcs).toBe("B82454");
  });

  it("non confonde la partita IVA lussemburghese con il numero RCS", () => {
    // LU + 8 cifre è la TVA, non un numero RCS (che inizia con una lettera).
    expect(normalizeLuIdentifiers({ vat: "LU12345678" }).rcs).toBeUndefined();
  });

  it("scarta una denominazione troppo corta per la ricerca", () => {
    expect(normalizeLuIdentifiers({ query: "AB" }).name).toBeUndefined();
    expect(normalizeLuIdentifiers({ query: "ArcelorMittal" }).name).toBe("ArcelorMittal");
  });
});

describe("LU — classificazione delle pagine ufficiali (fixture)", () => {
  it("la pagina che richiede login è una restrizione di autenticazione", () => {
    expect(classifyLbrPage(SEARCH_PAGE_WITH_LOGIN)).toBe("AUTH_REQUIRED");
  });

  it("una pagina inattesa non viene scambiata per un risultato", () => {
    expect(classifyLbrPage(UNKNOWN_PAGE)).toBe("UNKNOWN");
  });
});

describe("LU — adapter LBR", () => {
  it("dichiara AUTH_REQUIRED e non ritorna documenti", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(SEARCH_PAGE_WITH_LOGIN));
    const result = await luAdapter.listFinancialDocuments(
      { rcs: "B60814" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.restriction).toBe("AUTH_REQUIRED");
    expect(result.retryable).toBe(false);
  });

  it("non invia alcuna POST di ricerca finché la restrizione è attiva", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: (init?.method ?? "GET").toUpperCase() });
      return htmlResponse(SEARCH_PAGE_WITH_LOGIN);
    });
    await luAdapter.listFinancialDocuments(
      { name: "ArcelorMittal" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("senza identificativi utili dichiara una restrizione, senza contattare la rete", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(SEARCH_PAGE_WITH_LOGIN));
    const result = await luAdapter.listFinancialDocuments(
      {},
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("acquireDocument senza sourceRef valido resta SESSION_BOUND", async () => {
    const result = await luAdapter.acquireDocument(
      {
        id: "lu-none",
        year: 2024,
        kind: "ANNUAL_REPORT",
        format: "pdf",
        availability: "REGISTRY_ONLY",
      },
      {},
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.restriction).toBe("SESSION_BOUND");
  });
});

describe("LU — integrazione con orchestrator, coverage e pagina ufficiale", () => {
  it("un numero RCS lussemburghese non viene mai inviato al VIES", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return htmlResponse(SEARCH_PAGE_WITH_LOGIN);
      }),
    );
    await runSearch({ query: "", vat: "B60814", country: "LU" });
    expect(urls.some((u) => /ec\.europa\.eu/i.test(u))).toBe(false);
  });

  it("la risposta LU è REGISTRY_ONLY con restrizione dichiarata e pagina esterna", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => htmlResponse(SEARCH_PAGE_WITH_LOGIN)),
    );
    const response = await runSearch({ query: "ArcelorMittal", vat: "B82454", country: "LU" });
    expect(response.financials?.availability).toBe("REGISTRY_ONLY");
    expect(response.financials?.restriction).toBe("AUTH_REQUIRED");
    expect(response.financials?.documentUrl).toBeUndefined();
    expect(response.officialPage?.mode).toBe("external");
  });

  it("LU resta coperto ma nel livello browser-only, non tra le pagine incorporabili", () => {
    expect(isCovered("LU")).toBe(true);
    expect("LU" in BROWSER_ONLY_PAGES).toBe(true);
    expect("LU" in CONSULT_PAGES).toBe(false);
    expect(ALL_COUNTRIES.some((c) => c.iso === "LU")).toBe(true);
  });

  it("la pagina ufficiale LU punta alla scheda depositi LBR con istruzioni, senza iframe", () => {
    const page = officialPageFor("LU", "B60814", "ArcelorMittal");
    expect(page?.url).toBe("https://www.lbr.lu/mjrcs-web-front/consult-company/B60814?tab=deposit");
    expect(page?.mode).toBe("external");
    expect((page?.instructions ?? []).length).toBeGreaterThan(2);
  });
});
