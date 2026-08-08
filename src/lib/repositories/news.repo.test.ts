import { describe, expect, it } from "vitest";

import type { NewsFilters } from "../domain/types";
import { emptyRealResult } from "./news.repo";
import { buildRealFeedResult, mapRow, mapRows, newsRowSchema } from "./news.repo.mapping";
import { applyFilters, classifyReadError } from "./news.real.repo.server";

const NO_FILTERS: NewsFilters = {
  query: "",
  geo: "TUTTE",
  topic: "TUTTI",
  institutionalOnly: false,
  category: "TUTTE",
  country: "",
};

const validRow = {
  id: 42,
  title: "Aggiornamento linee guida",
  summary: "Sintesi",
  source_id: "src-ocse",
  source_name: "OCSE",
  source_kind: "ISTITUZIONALE",
  source_tier: "PRIMARY",
  original_date: "2026-07-01",
  last_verified_at: "2026-07-02",
  language: "it",
  geo: "OCSE",
  topic: "Documentazione",
  original_url: "https://www.oecd.org/doc",
  category: "Transfer Pricing",
  country: "Italia",
  pdf_url: "https://www.oecd.org/doc.pdf",
};

describe("mappatura righe reali", () => {
  it("mappa una riga conforme e la marca come non demo", () => {
    const parsed = newsRowSchema.parse(validRow);
    const item = mapRow(parsed);
    expect(item).not.toBeNull();
    expect(item?.id).toBe("42");
    expect(item?.isDemo).toBe(false);
    expect(item?.workflowState).toBe("PUBLISHED");
    expect(item?.pdfUrl).toBe("https://www.oecd.org/doc.pdf");
  });

  it("accetta gli alias camelCase", () => {
    const parsed = newsRowSchema.parse({
      ...validRow,
      source_name: undefined,
      sourceName: "OCSE",
      original_url: undefined,
      originalUrl: "https://www.oecd.org/doc",
    });
    expect(mapRow(parsed)?.sourceName).toBe("OCSE");
  });

  it("scarta le righe non conformi senza aggiustarle", () => {
    const { items, rejectedRows } = mapRows([
      validRow,
      { ...validRow, geo: "MARTE" },
      { ...validRow, original_url: undefined, originalUrl: undefined },
      "non-una-riga",
    ]);
    expect(items).toHaveLength(1);
    expect(rejectedRows).toBe(3);
  });
});

describe("composizione del risultato reale", () => {
  const items = mapRows([
    validRow,
    { ...validRow, id: 43, original_date: "2026-07-05" },
    { ...validRow, id: 44, original_date: "2026-06-01", country: "Germania" },
  ]).items;

  it("ordina per data discendente ed espone in evidenza il più recente", () => {
    const result = buildRealFeedResult({
      correlationId: "cid",
      generatedAt: "2026-07-10T00:00:00Z",
      items,
      filters: NO_FILTERS,
      rejectedRows: 0,
      status: "OK",
    });
    expect(result.repoKind).toBe("REAL");
    expect(result.repoStatus).toBe("OK");
    expect(result.featured?.id).toBe("43");
    expect(result.archive.map((i) => i.id)).toEqual(["43", "42", "44"]);
    expect(result.availableCountries).toEqual(["Germania", "Italia"]);
    expect(result.totalPublished).toBe(3);
  });

  it("con filtri attivi non espone in evidenza né ultime notizie", () => {
    const result = buildRealFeedResult({
      correlationId: "cid",
      generatedAt: "2026-07-10T00:00:00Z",
      items,
      filters: { ...NO_FILTERS, query: "linee" },
      rejectedRows: 0,
      status: "OK",
    });
    expect(result.featured).toBeNull();
    expect(result.latest).toEqual([]);
    expect(result.archive).toHaveLength(3);
  });

  it("segnala il formato inatteso come servizio ridotto", () => {
    const result = buildRealFeedResult({
      correlationId: "cid",
      generatedAt: "2026-07-10T00:00:00Z",
      items,
      filters: NO_FILTERS,
      rejectedRows: 2,
      status: "UNEXPECTED_SHAPE",
    });
    expect(result.health).toBe("DEGRADED");
    expect(result.rejectedRows).toBe(2);
  });
});

describe("guardrail: nessun fallback silenzioso", () => {
  it("gli esiti anomali restituiscono un archivio vuoto e mai dati demo", () => {
    for (const status of ["SCHEMA_UNAVAILABLE", "UNREACHABLE", "UNEXPECTED_SHAPE"] as const) {
      const result = emptyRealResult({ correlationId: "cid", status });
      expect(result.repoKind).toBe("REAL");
      expect(result.repoStatus).toBe(status);
      expect(result.archive).toEqual([]);
      expect(result.featured).toBeNull();
      expect(result.health).toBe("DEGRADED");
    }
  });

  it("distingue il dataset vuoto dall'errore", () => {
    const result = emptyRealResult({ correlationId: "cid", status: "EMPTY" });
    expect(result.health).toBe("OK");
    expect(result.repoStatus).toBe("EMPTY");
    expect(result.archive).toEqual([]);
  });
});

describe("classificazione degli errori di lettura", () => {
  it("riconosce vista assente e permessi negati come schema non disponibile", () => {
    expect(classifyReadError({ code: "42P01" })).toBe("SCHEMA_UNAVAILABLE");
    expect(classifyReadError({ message: "permission denied for view" })).toBe(
      "SCHEMA_UNAVAILABLE",
    );
    expect(classifyReadError({ code: "PGRST205", message: "Could not find the table" })).toBe(
      "SCHEMA_UNAVAILABLE",
    );
  });

  it("tratta gli altri errori come backend non raggiungibile", () => {
    expect(classifyReadError({ message: "network error" })).toBe("UNREACHABLE");
    expect(classifyReadError(null)).toBe("OK");
  });
});

describe("traduzione dei filtri in predicati", () => {
  it("applica solo i filtri effettivamente impostati", () => {
    const calls: string[] = [];
    const fake = {
      eq(column: string, value: string) {
        calls.push(`eq:${column}=${value}`);
        return fake;
      },
      or(filter: string) {
        calls.push(`or:${filter}`);
        return fake;
      },
      limit() {
        return Promise.resolve({ data: [], error: null });
      },
    };
    applyFilters(fake, {
      ...NO_FILTERS,
      geo: "UE",
      country: " Italia ",
      institutionalOnly: true,
      query: "safe harbor",
    });
    expect(calls).toEqual([
      "eq:geo=UE",
      "eq:country=Italia",
      "eq:source_kind=ISTITUZIONALE",
      "or:title.ilike.%safe harbor%,summary.ilike.%safe harbor%,source_name.ilike.%safe harbor%",
    ]);
  });
});

describe("default del flag", () => {
  it("VITE_USE_REAL_REPO assente significa mock", async () => {
    delete (import.meta.env as Record<string, unknown>)["VITE_USE_REAL_REPO"];
    const { useRealNewsRepo } = await import("../platform/feature-flags");
    expect(useRealNewsRepo()).toBe(false);
  });
});
