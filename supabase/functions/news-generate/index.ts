import { createClient } from 'jsr:@supabase/supabase-js@2';
import { authorizeCaller, jsonResponse } from '../_shared/auth.ts';
import { generateJson } from '../_shared/llm-provider.ts';
import { redactSecret } from '../_shared/redact.ts';
import { extractDomain, findSource } from '../_shared/whitelist.ts';
import { normalizeRef } from '../_shared/source-gate.ts';
import type { GateResult } from '../_shared/source-gate.ts';

/**
 * Failure whose cause is already known, so that news_discovery.gate_result records what
 * actually went wrong instead of collapsing every cause into FAIL_UNKNOWN. A reference
 * missing from the catalogue and a network error are not the same diagnosis, and reading
 * them as the same one sends the investigation to the source instead of to the catalogue.
 */
class GateError extends Error {
  constructor(readonly gateResult: GateResult, message: string) { super(message); }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const authClient = createClient(SUPABASE_URL, ANON_KEY);
const CATEGORIES = ['TP', 'VAT', 'Pillar Two', 'Anti-Avoidance'];
const CATEGORY_DB: Record<string, string> = { TP: 'TP', VAT: 'VAT', 'Pillar Two': 'P2', 'Anti-Avoidance': 'AA' };

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

  // Service-role client is created only after caller authorization has passed.
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  console.log(JSON.stringify({ event: 'news-generate.start', correlation_id: cid }));

  const { data: discoveries, error } = await supabase.from('news_discovery').select('*').eq('status', 'VERIFIED').limit(20);
  if (error) {
    console.error(JSON.stringify({ event: 'news-generate.discovery_query_failed', correlation_id: cid, error: redactSecret(error.message) }));
    return jsonResponse({ ok: false, error: 'persistence_failed' }, 500, cid);
  }
  const { data: norms } = await supabase.from('normative').select('key');
  const known = new Set((norms ?? []).map((x: { key: string }) => normalizeRef(x.key)));
  const created = [];
  for (const d of discoveries ?? []) {
    try {
      const sourceText = await fetchText(d.source_url);
      const domain = extractDomain(d.source_url);
      const source = findSource(domain);
      if (!source) throw new GateError('FAIL_DOMAIN', `dominio non whitelistato: ${domain}`);
      const draft = await generate(sourceText, domain);
      if (!CATEGORIES.includes(String(draft.category))) throw new Error(`categoria non valida: ${String(draft.category)}`);
      const category = CATEGORY_DB[String(draft.category)];
      const refs = Array.isArray(draft.normative_references) ? draft.normative_references.filter((x: unknown) => typeof x === 'string').map((x: string) => x.trim()) : [];
      const unknown = refs.filter((r: string) => !known.has(normalizeRef(r)));
      if (unknown.length) throw new GateError('FAIL_REF', `riferimenti normativi non presenti nel catalogo: ${unknown.join('; ')}`);
      const { data: dup } = await supabase.from('news_items').select('id').eq('source_url', d.source_url).maybeSingle();
      if (dup) { await supabase.from('news_discovery').update({ status: 'GENERATED', gate_result: 'PASS_DUPLICATE' }).eq('id', d.id); continue; }
      const { error: insertError } = await supabase.from('news_items').insert({ slug: slugify(String(draft.title)), title: String(draft.title), summary: String(draft.summary ?? '').slice(0, 500), content_markdown: String(draft.content_markdown ?? ''), category, country: String(draft.country ?? 'INT'), source_name: source.name, source_url: d.source_url, pdf_url: d.pdf_url ?? null, normative_references: refs, status: 'DRAFT', fetched_at: new Date().toISOString() });
      if (insertError) throw insertError;
      await supabase.from('news_discovery').update({ status: 'GENERATED', gate_result: 'PASS' }).eq('id', d.id);
      created.push(String(draft.title));
    } catch (e) {
      const safeError = redactSecret(e instanceof Error ? e.message : String(e));
      const gateResult: GateResult = e instanceof GateError ? e.gateResult : 'FAIL_UNKNOWN';
      console.error(JSON.stringify({ event: 'news-generate.item_failed', correlation_id: cid, discovery_id: d.id, gate_result: gateResult, error: safeError }));
      await supabase.from('news_discovery').update({ status: 'BLOCKED', gate_result: gateResult, error: safeError }).eq('id', d.id);
    }
  }
  console.log(JSON.stringify({ event: 'news-generate.complete', correlation_id: cid, verified_seen: discoveries?.length ?? 0, created: created.length }));
  return jsonResponse({ ok: true, created }, 200, cid);
});
