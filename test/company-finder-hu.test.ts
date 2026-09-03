import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifyEbeszamoloPage,
  huAdapter,
  normalizeHuIdentifiers,
} from "../src/lib/company-finder/registry/hu-ebeszamolo.server";
import { ALL_COUNTRIES } from "../src/lib/company-finder/countries";
import { BROWSER_ONLY_PAGES, CONSULT_PAGES, isCovered } from "../src/lib/company-finder/coverage";
import { officialPageFor } from "../src/lib/company-finder/official-pages";
import { runSearch } from "../src/lib/company-finder/orchestrator";

/**
 * Fixture: la pagina di ricerca ufficiale espone il widget anti-bot ALTCHA.
 * Non si aggira: si dichiara la restrizione.
 */
const SEARCH_PAGE_WITH_ALTCHA = `<!DOCTYPE html><html><body>
<form action="/Search/Results" enctype="multipart/form-data" id="rcForm" method="post">
<input name="firmNumber" id="firmNumber" pattern="\\d{2}-\\d{2}-\\d{6}" />
<input name="firmTaxNumber" id="firmTaxNumber" pattern="\\d{8}" />
<input name="firmName" id="firmName" pattern=".{4,}" />
<altcha-widget challengeurl="/altcha/challenge"></altcha-widget>
<button type="submit" id="btnSubmit">Keres</button>
</form></body></html>`;

/** Fixture: il link di risultato condiviso (parametri b/so/o) è legato alla sessione. */
const RESULT_PAGE_EXPIRED = `<!DOCTYPE html><html><body>
<div class="row"><h4>Hibás paraméterek!</h4><a href="javascript:history.go(-1);">Vissza</a></div>
</body></html>`;

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HU — normalizzazione degli identificativi", () => {
  it("riconosce l'adószám dalle prime 8 cifre, anche col prefisso IVA", () => {
    expect(normalizeHuIdentifiers({ vat: "HU10773381" }).adoszam8).toBe("10773381");
    expect(normalizeHuIdentifiers({ vat: "10773381-2-44" }).adoszam8).toBe("10773381");
  });

  it("riconosce il cégjegyzékszám nel formato NN-NN-NNNNNN", () => {
    const ids = normalizeHuIdentifiers({ vat: "01-10-041683" });
    expect(ids.cegjegyzekszam).toBe("01-10-041683");
    expect(ids.adoszam8).toBeUndefined();
  });

  it("scarta una denominazione più corta del minimo accettato dal registro", () => {
    expect(normalizeHuIdentifiers({ query: "Tod" }).name).toBeUndefined();
    expect(normalizeHuIdentifiers({ query: "Tod's" }).name).toBe("Tod's");
  });
});

describe("HU — classificazione delle pagine ufficiali (fixture)", () => {
  it("la pagina di ricerca con ALTCHA è una restrizione anti-bot", () => {
    expect(classifyEbeszamoloPage(SEARCH_PAGE_WITH_ALTCHA)).toBe("CAPTCHA_REQUIRED");
  });

  it("il link di risultato condiviso è legato alla sessione", () => {
    expect(classifyEbeszamoloPage(RESULT_PAGE_EXPIRED)).toBe("SESSION_BOUND");
  });
});

describe("HU — adapter e-Beszámoló", () => {
  it("dichiara CAPTCHA_REQUIRED e non ritorna documenti", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(SEARCH_PAGE_WITH_ALTCHA));
    const result = await huAdapter.listFinancialDocuments(
      { adoszam8: "10773381" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.restriction).toBe("CAPTCHA_REQUIRED");
    expect(result.retryable).toBe(false);
  });

  it("una pagina risultato scaduta è SESSION_BOUND, mai DOCUMENT_FOUND", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(RESULT_PAGE_EXPIRED));
    const result = await huAdapter.listFinancialDocuments(
      { adoszam8: "10773381" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.restriction).toBe("SESSION_BOUND");
  });

  it("non invia alcuna POST di ricerca finché la restrizione è attiva", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: (init?.method ?? "GET").toUpperCase() });
      return htmlResponse(SEARCH_PAGE_WITH_ALTCHA);
    });
    await huAdapter.listFinancialDocuments(
      { name: "Tod's Hungary" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(calls.some((c) => c.url.includes("/Search/Results"))).toBe(false);
  });

  it("acquireDocument senza sourceRef valido resta SESSION_BOUND", async () => {
    const result = await huAdapter.acquireDocument(
      { id: "hu-none", year: 2024, kind: "ANNUAL_REPORT", format: "pdf", availability: "REGISTRY_ONLY" },
      {},
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.restriction).toBe("SESSION_BOUND");
  });
});

describe("HU — integrazione con orchestrator, coverage e pagina ufficiale", () => {
  it("un cégjegyzékszám ungherese non viene mai inviato al VIES", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return htmlResponse(SEARCH_PAGE_WITH_ALTCHA);
      }),
    );
    await runSearch({ query: "", vat: "01-10-041683", country: "HU" });
    expect(urls.some((u) => /ec\.europa\.eu/i.test(u))).toBe(false);
  });

  it("la risposta HU è REGISTRY_ONLY con restrizione dichiarata e pagina esterna", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => htmlResponse(SEARCH_PAGE_WITH_ALTCHA)));
    const response = await runSearch({ query: "Tod's Hungary", vat: "HU10773381", country: "HU" });
    expect(response.financials?.availability).toBe("REGISTRY_ONLY");
    expect(response.financials?.restriction).toBe("CAPTCHA_REQUIRED");
    expect(response.financials?.documentUrl).toBeUndefined();
    expect(response.officialPage?.mode).toBe("external");
    expect(JSON.stringify(response)).not.toMatch(/[?&]b=|&so=|&o=/);
  });

  it("HU resta coperto ma nel livello browser-only, non tra le pagine incorporabili", () => {
    expect(isCovered("HU")).toBe(true);
    expect("HU" in BROWSER_ONLY_PAGES).toBe(true);
    expect("HU" in CONSULT_PAGES).toBe(false);
    expect(ALL_COUNTRIES.some((c) => c.iso === "HU")).toBe(true);
  });

  it("la pagina ufficiale HU punta alla ricerca e-Beszámoló con istruzioni, senza iframe", () => {
    const page = officialPageFor("HU", "HU10773381", "Tod's Hungary");
    expect(page?.url).toBe("https://e-beszamolo.im.gov.hu/oldal/beszamolo_kereses");
    expect(page?.mode).toBe("external");
    expect((page?.instructions ?? []).length).toBeGreaterThan(2);
  });
});
