import { createClient } from 'jsr:@supabase/supabase-js@2';
import { authorizeCaller, jsonResponse } from '../_shared/auth.ts';
import { generateJson } from '../_shared/llm-provider.ts';
import { redactSecret } from '../_shared/redact.ts';
import { extractDomain, findSource } from '../_shared/whitelist.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const authClient = createClient(SUPABASE_URL, ANON_KEY);
const CATEGORIES = ['TP', 'VAT', 'Pillar Two', 'Anti-Avoidance'];
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

function slugify(s: string) { return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 70) + '-' + crypto.randomUUID().slice(0, 8); }

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'user-agent': 'TPBox-Attualita-Bot/1.0' }, signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`source HTTP ${r.status}`);
  const ct = (r.headers.get('content-type') ?? '').toLowerCase();
  if (ct.includes('pdf') || /\.pdf(?:$|\?)/i.test(url)) {
    const { getDocument } = await import('https://deno.land/x/pdfjs@3.11.174/build/pdf.mjs');
    const bytes = new Uint8Array(await r.arrayBuffer());
    const pdf = await getDocument({ data: bytes }).promise;
    let text = '';
    for (let p = 1; p <= pdf.numPages && text.length < 16000; p++) {
      const page = await pdf.getPage(p); const content = await page.getTextContent();
      text += content.items.map((it: { str?: string }) => it.str ?? '').join(' ') + '\n';
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) throw new Error('PDF non parsabile o privo di testo');
    return text.slice(0, 12000);
  }
  const html = await r.text();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('source content vuoto');
  return text.slice(0, 12000);
}

async function generate(sourceText: string, sourceDomain: string) {
  const system = `Sei un redattore fiscale italiano esperto di transfer pricing e fiscalità internazionale.\nScrivi un articolo originale in italiano, esclusivamente come parafrasi della fonte primaria fornita. Non inventare fatti, date, numeri, enti o riferimenti.\nCategoria obbligatoria: TP, VAT, Pillar Two oppure Anti-Avoidance.\nEstrai solo riferimenti normativi esplicitamente presenti nella fonte.\nRispondi SOLO JSON con title, summary, content_markdown, category, country, normative_references. La fonte primaria è ${sourceDomain}.`;
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
    console.error(JSON.stringify({ event: 'news-generate.discovery_query_failed', correlation_id: cid, error: redactSecret(error.message) }));
    return jsonResponse({ ok: false, error: 'persistence_failed' }, 500, cid);
  }
  const { data: norms } = await supabase.from('normative').select('key');
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
      const sourceText = await fetchText(d.source_url);
      const domain = extractDomain(d.source_url);
      const source = findSource(domain);
      if (!source) throw new Error(`dominio non whitelistato: ${domain}`);
      const draft = await generate(sourceText, domain);
      if (!CATEGORIES.includes(String(draft.category))) throw new Error(`categoria non valida: ${String(draft.category)}`);
      const category = CATEGORY_DB[String(draft.category)];
      const refs = Array.isArray(draft.normative_references) ? draft.normative_references.filter((x: unknown) => typeof x === 'string').map((x: string) => x.trim()) : [];
      const unknown = refs.filter((r: string) => !known.has(r.toLowerCase()));
      if (unknown.length) throw new Error(`riferimenti normativi non presenti nel catalogo: ${unknown.join('; ')}`);
      const { data: dup } = await supabase.from('news_items').select('id').eq('source_url', d.source_url).maybeSingle();
      if (dup) { await supabase.from('news_discovery').update({ status: 'GENERATED', gate_result: 'PASS_DUPLICATE' }).eq('id', d.id); continue; }
      const { error: insertError } = await supabase.from('news_items').insert({ slug: slugify(String(draft.title)), title: String(draft.title), summary: String(draft.summary ?? '').slice(0, 500), content_markdown: String(draft.content_markdown ?? ''), category, country: String(draft.country ?? 'INT'), source_name: source.name, source_url: d.source_url, pdf_url: d.pdf_url ?? null, normative_references: refs, status: 'DRAFT', fetched_at: new Date().toISOString() });
      if (insertError) throw insertError;
      await supabase.from('news_discovery').update({ status: 'GENERATED', gate_result: 'PASS' }).eq('id', d.id);
      created.push(String(draft.title));
    } catch (e) {
      blocked += 1;
      const safeError = redactSecret(e instanceof Error ? e.message : String(e));
      console.error(JSON.stringify({ event: 'news-generate.item_failed', correlation_id: cid, discovery_id: d.id, error: safeError }));
      await supabase.from('news_discovery').update({ status: 'BLOCKED', gate_result: 'FAIL_UNKNOWN', error: safeError }).eq('id', d.id);
    }
  }

  const elapsedMs = Date.now() - startedAt;
  const partial = remaining > 0;
  console.log(JSON.stringify({ event: 'news-generate.complete', correlation_id: cid, verified_seen: discoveries?.length ?? 0, created: created.length, blocked, remaining, elapsed_ms: elapsedMs, partial }));
  return jsonResponse({ ok: true, created, blocked, remaining, status: partial ? 'partial' : 'completed', elapsed_ms: elapsedMs }, partial ? 202 : 200, cid);
});
