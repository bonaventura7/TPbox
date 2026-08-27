import { createClient } from 'jsr:@supabase/supabase-js@2';
import { authorizeCaller, jsonResponse } from '../_shared/auth.ts';
import { validateDraft } from '../_shared/draft-quality.ts';
import { errorMessage } from '../_shared/error-message.ts';
import { extractFactCandidates, validateGenerationInput } from '../_shared/generation-input.ts';
import { generateJson } from '../_shared/llm-provider.ts';
import { redactSecret } from '../_shared/redact.ts';
import { toReviewableNewsItemRow } from '../_shared/reviewable-row.ts';
import { extractDomain, findSource, isSpecificPrimaryUrl } from '../_shared/whitelist.ts';


const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const authClient = createClient(SUPABASE_URL, ANON_KEY);
const CATEGORY_DB: Record<string, string> = { TP: 'TP', VAT: 'VAT', 'Pillar Two': 'P2', 'Anti-Avoidance': 'AA' };

// ============================================================================
// INCIDENT 504 IDLE_TIMEOUT — budget di tempo e batch ridotto.
// Il worker Supabase interrompe la richiesta dopo 150s di inattività.
// Questa funzione ora:
//   - accetta batch_size (default 1, max 5) e time_budget_seconds (default 110, max 110)
//   - esce prima del limite server restituendo 200 (completato) o 202 (parziale)
//   - fa checkpoint dopo ogni articolo (stato aggiornato nel DB) => riavvio sicuro
//   - è idempotente: il check `maybeSingle` su source_url evita duplicati al retry
// ============================================================================
const DEFAULT_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 5;
const DEFAULT_TIME_BUDGET_MS = 110_000;
const MIN_TIME_BUDGET_MS = 10_000;
const SAFETY_MARGIN_MS = 15_000; // esci prima del limite server

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type FailureGate = 'FAIL_DOMAIN' | 'FAIL_HTTP' | 'FAIL_DUP' | 'FAIL_PDF' | 'FAIL_REF' | 'FAIL_EMPTY' | 'FAIL_UNKNOWN';

class GateFailure extends Error {
  constructor(public readonly gateResult: FailureGate, message: string) {
    super(message);
    this.name = 'GateFailure';
  }
}

function slugify(s: string) { return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 70) + '-' + crypto.randomUUID().slice(0, 8); }

async function fetchText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { 'user-agent': 'TPBox-Attualita-Bot/1.0' }, signal: AbortSignal.timeout(45000) });
  } catch (error) {
    throw new GateFailure('FAIL_HTTP', `source fetch fallito: ${errorMessage(error)}`);
  }

  if (!response.ok) throw new GateFailure('FAIL_HTTP', `source HTTP ${response.status}`);
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();

  if (contentType.includes('pdf') || /\.pdf(?:$|\?)/i.test(url)) {
    try {
      const { getDocument } = await import('npm:pdfjs-dist@4.4.168/legacy/build/pdf.mjs');
      const bytes = new Uint8Array(await response.arrayBuffer());
      const pdf = await getDocument({ data: bytes }).promise;
      let text = '';
      for (let pageNumber = 1; pageNumber <= pdf.numPages && text.length < 16000; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        text += content.items.map((item: { str?: string }) => item.str ?? '').join(' ') + '\n';
      }
      text = text.replace(/\s+/g, ' ').trim();
      if (!text) throw new Error('PDF privo di testo');
      return text.slice(0, 12000);
    } catch (error) {
      throw new GateFailure('FAIL_PDF', `PDF non parsabile: ${errorMessage(error)}`);
    }
  }

  const html = await response.text();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) throw new GateFailure('FAIL_EMPTY', 'source content vuoto');
  return text.slice(0, 12000);
}

async function generate(sourceText: string, sourceDomain: string) {
  const system = `Sei un redattore fiscale italiano esperto di transfer pricing e fiscalità internazionale.
Valuta esclusivamente il testo della fonte istituzionale primaria fornita (${sourceDomain}).
Una notizia pubblicabile deve descrivere uno sviluppo concreto: nuova norma, provvedimento, sentenza, consultazione, scadenza, chiarimento o modifica ufficiale. Una homepage, una pagina istituzionale generica o un testo privo di novità non è pubblicabile.
Non inventare fatti, date, numeri, enti, conseguenze o riferimenti. Non aggiungere consigli generici.
Se la fonte non è pubblicabile, rispondi SOLO JSON con publishable=false e rejection_reason.
Se è pubblicabile, rispondi SOLO JSON con:
- publishable=true
- title: titolo specifico sullo sviluppo, non il semplice nome dell'ente
- summary: 2-3 frasi, 100-500 caratteri
- content_markdown: articolo originale in italiano di 600-900 parole, con sezioni e soli fatti sostenuti dalla fonte
- category: esattamente TP, VAT, Pillar Two oppure Anti-Avoidance
- normative_references: array contenente solo riferimenti normativi esplicitamente presenti nella fonte.
Non includere country: il paese viene assegnato deterministicamente dalla whitelist.`;
  const { value } = await generateJson(
    [
      { role: 'system', content: system },
      { role: 'user', content: sourceText },
    ],
    {
      OPENROUTER_API_KEY: Deno.env.get('OPENROUTER_API_KEY'),
      LLM_MODEL: Deno.env.get('LLM_MODEL'),
      LLM_MODEL_FALLBACK: Deno.env.get('LLM_MODEL_FALLBACK'),
      LLM_ENDPOINT: Deno.env.get('LLM_ENDPOINT'),
      LLM_TIMEOUT_MS: Deno.env.get('LLM_TIMEOUT_MS'),
      LLM_MAX_RETRIES: Deno.env.get('LLM_MAX_RETRIES'),
    },
  );
  return value as Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  const auth = await authorizeCaller(req, authClient, Deno.env.get('NEWS_GENERATE_CALLER_USER_ID'), 'news-generate');
  if (!auth.ok) return auth.response;
  const { correlationId: cid } = auth;

  let batchSize = DEFAULT_BATCH_SIZE;
  let timeBudgetMs = DEFAULT_TIME_BUDGET_MS;
  try {
    const body = await req.json().catch(() => ({}));
    batchSize = clamp(Number(body.batch_size ?? DEFAULT_BATCH_SIZE), 1, MAX_BATCH_SIZE);
    const requested = Number(body.time_budget_seconds ?? 110) * 1000;
    timeBudgetMs = clamp(requested, MIN_TIME_BUDGET_MS, DEFAULT_TIME_BUDGET_MS);
  } catch {
    // corpo assente o non-JSON: default
  }

  const startedAt = Date.now();

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  console.log(JSON.stringify({ event: 'news-generate.start', correlation_id: cid, batch_size: batchSize, time_budget_ms: timeBudgetMs }));

  const { data: discoveries, error } = await supabase.from('news_discovery').select('*').eq('status', 'VERIFIED').limit(batchSize);
  if (error) {
    console.error(JSON.stringify({ event: 'news-generate.discovery_query_failed', correlation_id: cid, error: redactSecret(errorMessage(error)) }));
    return jsonResponse({ ok: false, error: 'persistence_failed' }, 500, cid);
  }
  const { data: norms, error: normsError } = await supabase.from('normative').select('key');
  if (normsError) {
    console.error(JSON.stringify({ event: 'news-generate.normative_query_failed', correlation_id: cid, error: redactSecret(errorMessage(normsError)) }));
    return jsonResponse({ ok: false, error: 'persistence_failed' }, 500, cid);
  }
  const known = new Set((norms ?? []).map((x: { key: string }) => x.key.trim().toLowerCase()));
  const created: string[] = [];
  let blocked = 0;
  let remaining = 0;

  for (const d of discoveries ?? []) {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs + SAFETY_MARGIN_MS > timeBudgetMs) {
      remaining += 1;
      console.warn(JSON.stringify({ event: 'news-generate.budget_exhausted', correlation_id: cid, elapsed_ms: elapsedMs, budget_ms: timeBudgetMs }));
      break;
    }
    try {
      if (!isSpecificPrimaryUrl(d.source_url)) {
        throw new GateFailure('FAIL_DOMAIN', 'source_url generica: la homepage istituzionale non è una notizia');
      }

      const domain = extractDomain(d.source_url);
      const source = findSource(domain);
      if (!source) throw new GateFailure('FAIL_DOMAIN', `dominio non whitelistato: ${domain}`);

      const sourceText = await fetchText(d.source_url);
      const rawDraft = await generate(sourceText, domain);
      const validation = validateDraft(rawDraft);
      if (!validation.ok) throw new GateFailure('FAIL_EMPTY', validation.reason);
      const draft = validation.value;

      const category = CATEGORY_DB[draft.category];
      const refs = draft.normative_references;
      const unknown = refs.filter((reference) => !known.has(reference.toLowerCase()));
      if (unknown.length) {
        throw new GateFailure('FAIL_REF', `riferimenti normativi non presenti nel catalogo: ${unknown.join('; ')}`);
      }

      const { data: duplicate, error: duplicateError } = await supabase.from('news_items').select('id').eq('source_url', d.source_url).maybeSingle();
      if (duplicateError) throw new Error(`controllo duplicati fallito: ${errorMessage(duplicateError)}`);
      if (duplicate) throw new GateFailure('FAIL_DUP', 'source_url già presente in news_items');

      const { error: insertError } = await supabase.from('news_items').insert({
        slug: slugify(draft.title),
        title: draft.title,
        summary: draft.summary,
        content_markdown: draft.content_markdown,
        category,
        country: source.country,
        source_name: source.name,
        source_url: d.source_url,
        pdf_url: d.pdf_url ?? null,
        normative_references: refs,
        status: 'DRAFT',
        fetched_at: new Date().toISOString(),
      });
      if (insertError) throw new Error(`news_items insert fallito: ${errorMessage(insertError)}`);

      const { error: checkpointError } = await supabase.from('news_discovery').update({ status: 'GENERATED', gate_result: 'PASS', error: null }).eq('id', d.id);
      if (checkpointError) throw new Error(`checkpoint GENERATED fallito: ${errorMessage(checkpointError)}`);
      created.push(draft.title);
    } catch (error) {
      blocked += 1;
      const gateResult = error instanceof GateFailure ? error.gateResult : 'FAIL_UNKNOWN';
      const safeError = redactSecret(errorMessage(error));
      console.error(JSON.stringify({ event: 'news-generate.item_failed', correlation_id: cid, discovery_id: d.id, gate_result: gateResult, error: safeError }));
      const { error: checkpointError } = await supabase.from('news_discovery').update({ status: 'BLOCKED', gate_result: gateResult, error: safeError }).eq('id', d.id);
      if (checkpointError) {
        console.error(JSON.stringify({ event: 'news-generate.checkpoint_failed', correlation_id: cid, discovery_id: d.id, error: redactSecret(errorMessage(checkpointError)) }));
      }
    }
  }

  const elapsedMs = Date.now() - startedAt;
  const partial = remaining > 0;
  console.log(JSON.stringify({ event: 'news-generate.complete', correlation_id: cid, verified_seen: discoveries?.length ?? 0, created: created.length, blocked, remaining, elapsed_ms: elapsedMs, partial }));
  return jsonResponse({ ok: true, created, blocked, remaining, status: partial ? 'partial' : 'completed', elapsed_ms: elapsedMs }, partial ? 202 : 200, cid);
});
