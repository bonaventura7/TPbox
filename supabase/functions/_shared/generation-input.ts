/**
 * Gate di INGRESSO della generazione editoriale (fail-closed).
 *
 * Nessuna chiamata LLM è ammessa se il materiale primario è insufficiente:
 * senza testo della fonte e senza fatti verificabili attribuiti a un URL, un
 * modello può solo inventare. Modulo puro: nessuna dipendenza da Deno, da rete
 * o da secret, così è riusabile e testabile lato repository.
 */

export interface GenerationFact {
  statement: string;
  sourceUrl: string;
}

export interface GenerationInput {
  primaryText: string;
  facts: GenerationFact[];
}

/** Soglie del gate di ingresso: sotto queste non si genera. */
export const MIN_PRIMARY_TEXT_CHARS = 2000;
export const MIN_GENERATION_FACTS = 3;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Ritorna l'elenco dei motivi di blocco. Array vuoto = input ammesso.
 */
export function validateGenerationInput(input: unknown): string[] {
  const reasons: string[] = [];
  if (!input || typeof input !== "object") return ["input di generazione non strutturato"];

  const candidate = input as Partial<GenerationInput>;
  const primaryText = typeof candidate.primaryText === "string" ? candidate.primaryText.trim() : "";
  const facts = Array.isArray(candidate.facts) ? candidate.facts : [];

  if (primaryText.length < MIN_PRIMARY_TEXT_CHARS) {
    reasons.push(
      `testo della fonte primaria insufficiente: ${primaryText.length} caratteri (minimo ${MIN_PRIMARY_TEXT_CHARS})`,
    );
  }
  if (facts.length < MIN_GENERATION_FACTS) {
    reasons.push(
      `fatti verificabili insufficienti: ${facts.length} (minimo ${MIN_GENERATION_FACTS})`,
    );
  }
  for (const fact of facts) {
    const statement = typeof fact?.statement === "string" ? fact.statement.trim() : "";
    const sourceUrl = typeof fact?.sourceUrl === "string" ? fact.sourceUrl.trim() : "";
    if (!statement) reasons.push("fatto privo di enunciato");
    if (!isHttpUrl(sourceUrl)) reasons.push(`fatto senza URL fonte valida: ${sourceUrl}`);
  }

  return reasons;
}

const FACT_MARKERS =
  /(art\.|articolo|comma|d\.lgs|dpr|circolare|risoluzione|regolamento|direttiva|sentenza|provvedimento|apa|oecd|ocse|\d{4}|%|€)/i;

/**
 * Estrazione deterministica di fatti candidati dal testo della fonte: nessuna
 * inferenza, solo frasi realmente presenti nel documento, attribuite al suo URL.
 */
export function extractFactCandidates(
  text: string,
  sourceUrl: string,
  limit = 12,
): GenerationFact[] {
  const seen = new Set<string>();
  const facts: GenerationFact[] = [];
  for (const raw of text.split(/(?<=[.;:!?])\s+/)) {
    const statement = raw.replace(/\s+/g, " ").trim();
    if (statement.length < 40 || statement.length > 400) continue;
    if (!FACT_MARKERS.test(statement)) continue;
    const key = statement.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({ statement, sourceUrl });
    if (facts.length >= limit) break;
  }
  return facts;
}
