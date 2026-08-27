import { describe, expect, it } from "vitest";

import {
  buildMessages,
  buildUserPrompt,
  countWords,
  renderDraftMarkdown,
  structureFor,
  toNewsItemRow,
  validateEditorialDraft,
  type EditorialDraft,
} from "@/editorial-engine";
import { parseArticleMarkdown } from "@/lib/domain/article-markdown";
import { INDIA_APA_DRAFT } from "./fixtures/india-apa-2025-26";

function failureReasons(draft: unknown): string[] {
  const result = validateEditorialDraft(draft);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.reasons;
}

describe("golden case — India APA 2025-26", () => {
  it("passa il quality gate", () => {
    expect(validateEditorialDraft(INDIA_APA_DRAFT).ok).toBe(true);
  });

  it("rispetta la densità minima del tipo APA", () => {
    expect(countWords(INDIA_APA_DRAFT.bodyMd)).toBeGreaterThanOrEqual(structureFor("APA").minWords);
  });

  it("produce un markdown con sezioni, box, punti chiave e fonti", () => {
    const blocks = parseArticleMarkdown(renderDraftMarkdown(INDIA_APA_DRAFT));
    const headings = blocks.filter((block) => block.kind === "heading");
    const callouts = blocks.filter((block) => block.kind === "callout");

    expect(headings.length).toBeGreaterThanOrEqual(5);
    expect(callouts).toHaveLength(2);
    expect(callouts.map((block) => block.kind === "callout" && block.callout)).toEqual([
      "TECNICO",
      "PRATICA",
    ]);
    expect(
      headings.some((block) => block.kind === "heading" && block.text === "Punti chiave"),
    ).toBe(true);
    expect(headings.some((block) => block.kind === "heading" && block.text === "Fonti")).toBe(true);
  });

  it("prepara una riga news_items in stato DRAFT, mai pubblicata dall'engine", () => {
    const row = toNewsItemRow(INDIA_APA_DRAFT);
    expect(row.status).toBe("DRAFT");
    expect(row.slug).toBe("india-rapporto-apa-2025-26");
    expect(row.source_url).toContain("incometaxindia.gov.in");
    expect(row.content_markdown).toContain("[!TECNICO]");
  });
});

describe("validator del draft redazionale", () => {
  it("rifiuta un draft privo di fonti", () => {
    const draft: EditorialDraft = { ...INDIA_APA_DRAFT, sources: [] };
    expect(failureReasons(draft).some((reason) => reason.includes("privo di fonti"))).toBe(true);
  });

  it("rifiuta un draft con sola fonte secondaria", () => {
    const draft: EditorialDraft = {
      ...INDIA_APA_DRAFT,
      sources: [{ label: "rassegna", url: "https://example.org/news", role: "SECONDARY" }],
    };
    expect(failureReasons(draft).some((reason) => reason.includes("fonte primaria"))).toBe(true);
  });

  it("rifiuta un articolo troppo breve per il suo tipo", () => {
    const draft: EditorialDraft = {
      ...INDIA_APA_DRAFT,
      bodyMd: "## Sezione\n\nTesto breve.\n\n## Altra\n\nAncora breve.\n\n## Terza\n\nFine.",
    };
    expect(failureReasons(draft).some((reason) => reason.includes("troppo breve"))).toBe(true);
  });

  it("rifiuta placeholder residui", () => {
    const draft: EditorialDraft = {
      ...INDIA_APA_DRAFT,
      bodyMd: `${INDIA_APA_DRAFT.bodyMd}\n\nDato da verificare: [inserire percentuale].`,
    };
    expect(failureReasons(draft).some((reason) => reason.includes("placeholder"))).toBe(true);
  });

  it("rifiuta uno slug non valido", () => {
    const draft: EditorialDraft = { ...INDIA_APA_DRAFT, slug: "India APA 2025/26" };
    expect(failureReasons(draft).some((reason) => reason.includes("slug non valido"))).toBe(true);
  });

  it("rifiuta un tipo di notizia sconosciuto", () => {
    expect(failureReasons({ ...INDIA_APA_DRAFT, newsType: "GOSSIP" })[0]).toContain(
      "tipo di notizia non valido",
    );
  });

  it("rifiuta struttura e takeaway insufficienti", () => {
    const reasons = failureReasons({
      ...INDIA_APA_DRAFT,
      bodyMd: INDIA_APA_DRAFT.bodyMd.replace(/^## .*$/gm, "Testo."),
      takeaways: ["solo uno"],
    });
    expect(reasons.some((reason) => reason.includes("struttura insufficiente"))).toBe(true);
    expect(reasons.some((reason) => reason.includes("takeaway insufficienti"))).toBe(true);
  });
});

describe("prompt del generatore", () => {
  const input = {
    newsType: "COURT_CASE" as const,
    primaryText: "Testo integrale della sentenza.",
    facts: [{ statement: "La corte ha respinto il ricorso.", sourceUrl: "https://example.gov/x" }],
    sources: [{ label: "Corte", url: "https://example.gov/x", role: "PRIMARY" as const }],
    jurisdiction: "Italia",
  };

  it("ancora il modello ai fatti estratti e vieta l'invenzione", () => {
    const prompt = buildUserPrompt(input);
    expect(prompt).toContain("usa solo questi come base factuale");
    expect(prompt).toContain("La corte ha respinto il ricorso.");
    expect(prompt).toContain("COURT_CASE");
    expect(buildMessages(input)[0]?.content).toContain("Non inventare dati");
  });

  it("comunica la struttura del tipo, non una struttura fissa", () => {
    expect(buildUserPrompt(input)).toContain("La decisione");
    expect(buildUserPrompt({ ...input, newsType: "PILLAR_TWO" })).toContain("regole GloBE");
  });
});
