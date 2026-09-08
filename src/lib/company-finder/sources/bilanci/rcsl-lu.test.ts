import { describe, expect, it, vi } from "vitest";

import {
  fetchLuxAccounts,
  gdLuLinkFromInput,
  luxRcsFromAnyText,
  luxRcsFromInput,
  parseLuxFilingLinks,
} from "./rcsl-lu";

describe("luxRcsFromInput", () => {
  it("normalizza le forme tipiche del numero RCS", () => {
    expect(luxRcsFromInput("B60814")).toBe("B60814");
    expect(luxRcsFromInput("B 60.814")).toBe("B60814");
    expect(luxRcsFromInput("b-60814")).toBe("B60814");
    expect(luxRcsFromInput(" b60814 ")).toBe("B60814");
  });

  it("rifiuta partite IVA lussemburghesi: IVA e RCS non coincidono", () => {
    expect(luxRcsFromInput("LU17217953")).toBeUndefined();
    expect(luxRcsFromInput("17217953")).toBeUndefined();
    expect(luxRcsFromInput("")).toBeUndefined();
  });
});

describe("luxRcsFromAnyText", () => {
  it("estrae il RCS da identificativi strutturati", () => {
    expect(luxRcsFromAnyText("LURCSL.B60814")).toBe("B60814");
    expect(luxRcsFromAnyText("reg. n° B24317")).toBe("B24317");
    expect(luxRcsFromAnyText("nessun numero")).toBeUndefined();
  });
});

describe("gdLuLinkFromInput", () => {
  it("normalizza i permalink ufficiali incollati dall'utente", () => {
    expect(gdLuLinkFromInput("https://gd.lu/rcsl/8hxWqS")).toBe("https://gd.lu/rcsl/8hxWqS");
    expect(gdLuLinkFromInput("gd.lu/resa/fcJ6hl?x=1")).toBe("https://gd.lu/resa/fcJ6hl");
    expect(gdLuLinkFromInput("https://www.example.com/doc")).toBeUndefined();
  });
});

const fixture = `<!doctype html><html><body>
<table>
<tr><td>16/01/2026</td><td>Comptes annuels (eCDF)</td>
<td><a href="https://gd.lu/rcsl/8hxWqS">Consulter — Comptes annuels (eCDF) exercice 2025</a></td></tr>
<tr><td>09/01/2025</td><td>Comptes annuels (eCDF)</td>
<td><a href="https://gd.lu/rcsl/4hFg7V">Consulter — Comptes annuels (eCDF) exercice 2024</a></td></tr>
<tr><td>08/04/2026</td><td>Statuts coordonnés</td>
<td><a href="/mjrcs/jsp/displayDocument.do?ref=X123&amp;file=statuts.pdf">statuts.pdf</a></td></tr>
<tr><td><a href="https://www.lbr.lu/mjrcs-web-front/contact">Contact</a></td></tr>
</table>
</body></html>`;

describe("parseLuxFilingLinks", () => {
  it("estrae i depositi contabili ordinati per anno decrescente", () => {
    const filings = parseLuxFilingLinks(fixture, "https://www.lbr.lu/mjrcs-web-front/x");
    expect(filings.length).toBeGreaterThanOrEqual(3);
    expect(filings[0]?.year).toBe(2025);
    expect(filings[0]?.url).toContain("gd.lu/rcsl/");
    expect(filings[0]?.kind).toBe("BALANCE_SHEET");
    expect(filings.map((f) => f.kind)).toContain("OTHER"); // statuts
    expect(filings.some((f) => f.url.includes("contact"))).toBe(false);
  });
});

const captchaFixture = `<!doctype html><html><body>
<h1>Consult the file of a company or association</h1>
<div>Captcha Resolution in progress… Friendly Captcha anti-spam widget</div>
</body></html>`;

describe("fetchLuxAccounts", () => {
  it("serve subito il permalink gd.lu senza chiamare la rete", async () => {
    const result = await fetchLuxAccounts({ gdLuUrl: "https://gd.lu/rcsl/8hxWqS" });
    expect(result.ok).toBe(true);
    expect(result.data?.availability).toBe("DOCUMENT_DOWNLOADABLE");
    expect(result.data?.documentUrl).toContain(
      "/api/company-finder/document?url=https%3A%2F%2Fgd.lu%2Frcsl%2F8hxWqS",
    );
  });

  it("senza RCS né link spiega cosa serve inserire", async () => {
    const result = await fetchLuxAccounts({ query: "Acme" });
    expect(result.ok).toBe(false);
    expect(result.skipped).toContain("RCS");
  });

  it("degrada a REGISTRY_ONLY dichiarando il CAPTCHA del portale LBR", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () =>
        new Response(captchaFixture, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    ) as typeof fetch;
    try {
      const result = await fetchLuxAccounts({ rcs: "B60814" });
      expect(result.ok).toBe(true);
      expect(result.data?.availability).toBe("REGISTRY_ONLY");
      expect(result.data?.restriction).toBe("CAPTCHA_REQUIRED");
      expect(result.data?.note).toContain("gratuiti");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("quando la pagina espone i link, serve in pagina il deposito più recente", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("tab=deposit")) {
        return new Response(fixture, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("not found", { status: 404 });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      const result = await fetchLuxAccounts({ rcs: "B60814" });
      expect(result.ok).toBe(true);
      expect(result.data?.availability).toBe("DOCUMENT_DOWNLOADABLE");
      expect(result.data?.documentUrl).toContain(
        encodeURIComponent("https://gd.lu/rcsl/8hxWqS"),
      );
      expect(result.data?.documents?.[0]?.year).toBe(2025);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
