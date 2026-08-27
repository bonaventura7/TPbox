/**
 * Prompt/template del generatore, tenuti separati dal validator e dal
 * trasporto (LLM provider, edge function). Nessuna chiave, nessun fetch: qui si
 * costruiscono soltanto stringhe.
 *
 * Regola non negoziabile: il modello scrive a partire dai fatti estratti dal
 * documento, non riscrive un articolo di terzi. Le fonti secondarie servono
 * come segnalazione (discovery), non come testo da parafrasare.
 */
import { structureFor } from "./structure";
import type { DraftSource, NewsType } from "./types";

export interface ExtractedFact {
  /** Enunciato verificabile, così come risulta dal documento. */
  statement: string;
  /** URL della fonte da cui il fatto è tratto. */
  sourceUrl: string;
}

export interface GenerationInput {
  newsType: NewsType;
  /** Testo documentale della fonte primaria, già estratto server-side. */
  primaryText: string;
  facts: ExtractedFact[];
  sources: DraftSource[];
  /** Giurisdizione o organizzazione di riferimento, se nota. */
  jurisdiction?: string;
}

export const SYSTEM_PROMPT = [
  "Sei un redattore tecnico italiano specializzato in transfer pricing e fiscalità internazionale.",
  "Scrivi articoli originali, sobri e verificabili per un pubblico di professionisti.",
  "Regole inderogabili:",
  "1. Non inventare dati. Se una cifra, una data o un riferimento normativo non è presente nel materiale fornito, non citarlo e non stimarlo.",
  "2. Separa i fatti dall'analisi: i fatti derivano dal documento, l'analisi è dichiarata come lettura professionale.",
  "3. Non parafrasare articoli di terzi. Le fonti secondarie indicano la notizia; il testo si costruisce sul documento primario.",
  "4. Non usare placeholder, segnaposto o formule del tipo 'da verificare'.",
  "5. Italiano professionale, nessun tono promozionale, nessuna consulenza personalizzata.",
  "Rispondi esclusivamente con un oggetto JSON valido.",
].join("\n");

const OUTPUT_CONTRACT = [
  "{",
  '  "newsType": "<tipo indicato>",',
  '  "category": "TP" | "VAT" | "Pillar Two" | "Anti-Avoidance",',
  '  "title": "titolo specifico, 25-180 caratteri",',
  '  "slug": "slug-minuscolo-con-trattini",',
  '  "excerpt": "lead 120-600 caratteri con il fatto principale",',
  '  "bodyMd": "corpo markdown con sezioni ## e, se utile, ###",',
  '  "sources": [{ "label": "ente", "url": "https://...", "role": "PRIMARY" | "SECONDARY" }],',
  '  "boxes": [{ "kind": "NORMATIVA" | "TECNICO" | "PRATICA" | "ATTENZIONE", "title": "...", "lines": ["..."] }],',
  '  "takeaways": ["punto operativo", "..."],',
  '  "normativeReferences": ["riferimento presente nel catalogo"]',
  "}",
].join("\n");

export function buildUserPrompt(input: GenerationInput): string {
  const structure = structureFor(input.newsType);
  const [minTarget, maxTarget] = structure.targetWords;

  return [
    `Tipo di notizia: ${input.newsType}`,
    input.jurisdiction ? `Giurisdizione o organizzazione: ${input.jurisdiction}` : "",
    "",
    `Lunghezza indicativa del corpo: ${minTarget}-${maxTarget} parole quando il documento lo consente; mai sotto ${structure.minWords} parole.`,
    `Sezioni suggerite (adatta i titoli al caso concreto, mantieni almeno tre sezioni):`,
    ...structure.sections.map((section) => `- ${section}`),
    `Box previsti per questo tipo: ${structure.boxes.join(", ")}.`,
    `Takeaway richiesti: almeno ${structure.minTakeaways}.`,
    "",
    "Fatti estratti dal documento (usa solo questi come base factuale):",
    ...input.facts.map((fact) => `- ${fact.statement} [${fact.sourceUrl}]`),
    "",
    "Fonti da citare:",
    ...input.sources.map((source) => `- ${source.role}: ${source.label} — ${source.url}`),
    "",
    "Testo documentale della fonte primaria:",
    '"""',
    input.primaryText.slice(0, 12000),
    '"""',
    "",
    "Contratto di output JSON:",
    OUTPUT_CONTRACT,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function buildMessages(input: GenerationInput) {
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: buildUserPrompt(input) },
  ];
}
