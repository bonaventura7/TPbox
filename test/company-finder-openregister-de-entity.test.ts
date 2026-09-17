import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchOpenRegisterFinancials } from "../src/lib/company-finder/sources/bilanci/openregister-de";

afterEach(() => vi.unstubAllGlobals());

/**
 * L'autocomplete di OpenRegister NON espande "AG" -> "Aktiengesellschaft" e cerca
 * il nome registrato. Misurato 2026-09-17:
 *   query "Siemens AG"              -> Verein + controllate, NON la capogruppo
 *   query "Siemens Aktiengesellschaft" -> la Siemens AG madre come primo risultato
 * Prima del fix il tool sceglieva "Verein von Belegschaftsaktionaeren in der
 * Siemens AG" (un'associazione) per la sola presenza di "siemens" nel nome.
 *
 * Le fixture qui sotto sono i nomi e i campi reali restituiti dalla fonte.
 */

interface Row {
  company_id: string;
  name: string;
  country?: string;
  legal_form?: string;
  register_type?: string;
  active?: boolean;
}

function stub(byQuery: Record<string, Row[]>, financialsById: Record<string, unknown>) {
  const seen: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      seen.push(url);

      const ac = url.match(/\/v1\/autocomplete\/company\?query=([^&]+)/);
      if (ac) {
        const q = decodeURIComponent(ac[1]!.replace(/\+/g, " "));
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: byQuery[q] ?? [] }),
        } as unknown as Response;
      }

      const fin = url.match(/\/v1\/company\/([^/]+)\/financials$/);
      if (fin) {
        const id = decodeURIComponent(fin[1]!);
        return {
          ok: true,
          status: 200,
          json: async () => financialsById[id] ?? { indicators: [], reports: [] },
        } as unknown as Response;
      }

      throw new Error(`unexpected URL ${url}`);
    }),
  );
  return { seen };
}

const SIEMENS_AG: Row[] = [
  {
    company_id: "DE-VR-D2601-15117",
    name: "Verein von Belegschaftsaktionären in der Siemens AG, e.V. München",
    country: "DE",
    legal_form: "ev",
    register_type: "VR",
    active: true,
  },
  { company_id: "DE-HRB-D2601-237558", name: "Siemens Healthineers AG", country: "DE", register_type: "HRB", active: true },
  { company_id: "DE-HRB-D2601-252581", name: "Siemens Energy AG", country: "DE", register_type: "HRB", active: true },
];

const SIEMENS_AKTIENGESELLSCHAFT: Row[] = [
  { company_id: "DE-HRB-D2601-6684", name: "Siemens Aktiengesellschaft", country: "DE", register_type: "HRB", active: true },
  {
    company_id: "DE-HRB-D2601-9999",
    name: "Siemens Aktiengesellschaft Zweigniederlassung München",
    country: "DE",
    register_type: "HRB",
    active: false,
  },
];

const INDICATORS = {
  reports: [],
  indicators: [{ date: "2025-12-31", revenue: 100_000_00, net_income: 10_000_00 }],
};

describe("OpenRegister — selezione dell'entità tedesca", () => {
  it('"Siemens AG" sceglie la Siemens Aktiengesellschaft, non il Verein', async () => {
    const { seen } = stub(
      { "Siemens AG": SIEMENS_AG, "Siemens Aktiengesellschaft": SIEMENS_AKTIENGESELLSCHAFT },
      { "DE-HRB-D2601-6684": INDICATORS },
    );

    const result = await fetchOpenRegisterFinancials("Siemens AG", "test-key");

    expect(result.ok).toBe(true);
    expect(result.data?.note).toContain("Siemens Aktiengesellschaft");
    // ha davvero provato la forma estesa (senza, la capogruppo non emerge)
    expect(seen.some((u) => u.includes("Siemens+Aktiengesellschaft"))).toBe(true);
    // ha chiesto i financials della capogruppo, non del Verein né della controllata
    expect(seen.some((u) => u.includes("/company/DE-HRB-D2601-6684/financials"))).toBe(true);
    expect(seen.some((u) => u.includes("DE-VR-D2601-15117"))).toBe(false);
  });

  it("scarta la sola associazione e dichiara non trovata", async () => {
    stub(
      {
        "Siemens AG": [SIEMENS_AG[0]!], // solo il Verein
        "Siemens Aktiengesellschaft": [], // la capogruppo non emerge
      },
      {},
    );

    const result = await fetchOpenRegisterFinancials("Siemens AG", "test-key");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("non trovata");
  });

  it("non tocca l'espansione quando la query non finisce per AG (es. GmbH)", async () => {
    const { seen } = stub(
      {
        "ORI MARTIN GMBH": [
          { company_id: "DE-HRB-F1103-267645", name: "ORI MARTIN Deutschland GmbH", country: "DE", register_type: "HRB", active: true },
        ],
      },
      { "DE-HRB-F1103-267645": INDICATORS },
    );

    const result = await fetchOpenRegisterFinancials("ORI MARTIN GMBH", "test-key");

    expect(result.ok).toBe(true);
    // una sola query di autocomplete: nessuna espansione spuria
    expect(seen.filter((u) => u.includes("/autocomplete/")).length).toBe(1);
  });
});
