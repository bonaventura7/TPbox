import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  MIN_GENERATION_FACTS,
  MIN_PRIMARY_TEXT_CHARS,
  toReviewableNewsItemRow,
  validateEditorialDraft,
  validateGenerationInput,
} from "@/editorial-engine";
import {
  extractFactCandidates,
  validateGenerationInput as validateGenerationInputPipeline,
} from "../supabase/functions/_shared/generation-input";
import {
  MIN_PUBLISHABLE_CONTENT_CHARS,
  toReviewableNewsItemRow as toReviewablePipelineRow,
} from "../supabase/functions/_shared/reviewable-row";
import { INDIA_APA_DRAFT } from "./fixtures/india-apa-2025-26";

/** Il record India storico: 802 caratteri di corpo, pubblicato senza gate. */
const SHORT_802 = "L'India ha pubblicato il rapporto APA 2025-26 con dati sugli accordi. ".repeat(
  12,
).slice(0, 802);

describe("gate di ingresso della generazione", () => {
  it("blocca primaryText da 802 caratteri e facts vuoti", () => {
    const reasons = validateGenerationInput({ primaryText: SHORT_802, facts: [] });
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.some((reason) => reason.includes(String(MIN_PRIMARY_TEXT_CHARS)))).toBe(true);
    expect(reasons.some((reason) => reason.includes(String(MIN_GENERATION_FACTS)))).toBe(true);
  });

  it("ammette testo e fatti sufficienti", () => {
    const facts = Array.from({ length: MIN_GENERATION_FACTS }, (_, index) => ({
      statement: `Fatto verificabile numero ${index + 1} presente nel documento.`,
      sourceUrl: "https://www.incometaxindia.gov.in/apa-report-2025-26.pdf",
    }));
    expect(validateGenerationInput({ primaryText: "x".repeat(MIN_PRIMARY_TEXT_CHARS), facts })).toEqual(
      [],
    );
  });

  it("rifiuta fatti senza URL fonte valida", () => {
    const facts = Array.from({ length: MIN_GENERATION_FACTS }, () => ({
      statement: "Enunciato presente nel documento.",
      sourceUrl: "non-una-url",
    }));
    const reasons = validateGenerationInput({ primaryText: "x".repeat(MIN_PRIMARY_TEXT_CHARS), facts });
    expect(reasons.some((reason) => reason.includes("URL fonte"))).toBe(true);
  });

  it("mantiene la parità di politica tra engine e pipeline", () => {
    const cases: unknown[] = [
      { primaryText: SHORT_802, facts: [] },
      { primaryText: "x".repeat(MIN_PRIMARY_TEXT_CHARS), facts: [] },
      null,
    ];
    for (const input of cases) {
      expect(validateGenerationInputPipeline(input)).toEqual(validateGenerationInput(input));
    }
  });

  it("estrae fatti deterministici solo dal testo della fonte", () => {
    const url = "https://www.incometaxindia.gov.in/apa-report-2025-26.pdf";
    const text =
      "Il rapporto APA 2025-26 registra 174 accordi unilaterali firmati nel 2025. " +
      "Una frase priva di riferimenti concreti. " +
      "L'art. 92CC dell'Income Tax Act disciplina la procedura di accordo preventivo. " +
      "Le istanze pendenti risultano pari a 1 200 unità al 31 marzo 2026.";
    const first = extractFactCandidates(text, url);
    expect(first).toEqual(extractFactCandidates(text, url));
    expect(first.length).toBeGreaterThanOrEqual(MIN_GENERATION_FACTS);
    for (const fact of first) {
      expect(text).toContain(fact.statement);
      expect(fact.sourceUrl).toBe(url);
    }
  });
});

describe("regressione articolo da 802 caratteri", () => {
  it("non passa il quality gate del draft", () => {
    const result = validateEditorialDraft({ ...INDIA_APA_DRAFT, bodyMd: SHORT_802 });
    expect(result.ok).toBe(false);
  });

  it("non produce mai una riga pubblicabile", () => {
    const result = toReviewableNewsItemRow({ ...INDIA_APA_DRAFT, bodyMd: SHORT_802 });
    expect(result.ok).toBe(false);
  });
});

describe("serializzazione fail-closed", () => {
  it("toReviewableNewsItemRow non produce mai PUBLISHED", () => {
    const result = toReviewableNewsItemRow(INDIA_APA_DRAFT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("DRAFT");
  });

  it("la riga di pipeline è DRAFT sia in PASS sia in FAIL", () => {
    const base = {
      slug: "india-apa-report-2025-26",
      title: "India, rapporto APA 2025-26: cosa cambia per i gruppi con presenza indiana",
      sourceUrl: "https://www.incometaxindia.gov.in/apa-report-2025-26.pdf",
    };

    const failed = toReviewablePipelineRow({ ...base, contentMarkdown: SHORT_802, reasons: [] });
    expect(failed.status).toBe("DRAFT");
    expect(failed.flag_pending_review).toBe(true);
    expect(failed.gate_result.ok).toBe(false);
    expect(failed.gate_result.reasons.join(" ")).toContain(String(MIN_PUBLISHABLE_CONTENT_CHARS));

    const passed = toReviewablePipelineRow({
      ...base,
      contentMarkdown: "x".repeat(MIN_PUBLISHABLE_CONTENT_CHARS + 1),
      reasons: [],
    });
    expect(passed.status).toBe("DRAFT");
    expect(passed.flag_pending_review).toBe(false);
    expect(passed.gate_result).toEqual({ ok: true, reasons: [] });

    const withReasons = toReviewablePipelineRow({
      ...base,
      contentMarkdown: "x".repeat(MIN_PUBLISHABLE_CONTENT_CHARS + 1),
      reasons: ["input di generazione insufficiente"],
    });
    expect(withReasons.status).toBe("DRAFT");
    expect(withReasons.flag_pending_review).toBe(true);
  });
});

describe("contratto delle edge function", () => {
  const generate = readFileSync("supabase/functions/news-generate/index.ts", "utf8");
  const publish = readFileSync("supabase/functions/news-publish/index.ts", "utf8");

  it("news-generate valida l'input prima di chiamare l'LLM", () => {
    const gateAt = generate.indexOf("validateGenerationInput({");
    const llmAt = generate.indexOf("await generate(sourceText");
    expect(gateAt).toBeGreaterThan(-1);
    expect(llmAt).toBeGreaterThan(gateAt);
  });

  it("news-generate scrive sempre righe DRAFT con upsert idempotente su slug", () => {
    expect(generate).not.toContain("'PUBLISHED'");
    expect(generate).toContain("toReviewableNewsItemRow");
    expect(generate.match(/onConflict: 'slug'/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("news-publish pubblica solo da DRAFT con gate_result.ok === true", () => {
    expect(publish).toContain(".ok===true");
    expect(publish).toContain("it.status!=='DRAFT'");
    expect(publish).toContain("MIN_PUBLISHABLE_CONTENT_CHARS");
    const publishAt = publish.indexOf("status:'PUBLISHED'");
    expect(publishAt).toBeGreaterThan(publish.indexOf("gateOk"));
  });
});
