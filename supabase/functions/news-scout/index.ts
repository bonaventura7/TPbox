import { createClient } from 'jsr:@supabase/supabase-js@2';
import { canonicalUrl, extractDomain, findSource } from '../_shared/whitelist.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FEED = Deno.env.get('REGFOLLOWER_FEED') ?? 'https://regfollower.com/feed/';
const UA = 'TPBox-Attualita-Bot/1.0';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

type FeedItem = { id: string; title: string; raw: string; link: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function authorized(req: Request): boolean {
  const authorization = req.headers.get('authorization') ?? '';
  return Boolean(SERVICE_KEY) && authorization === `Bearer ${SERVICE_KEY}`;
}

function stripHtml(s: string) {
  return s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function extractPrimaryUrl(raw: string, fallback: string): string | null {
  const candidates = [...raw.matchAll(/https?:\/\/[^\s"'<>]+/gi)].map(m => m[0].replace(/[),.;]+$/, ''));
  for (const url of [fallback, ...candidates]) {
    if (findSource(extractDomain(url))) return canonicalUrl(url);
  }
  return null;
}

function parseFeed(xml: string): FeedItem[] {
  const out: FeedItem[] = [];
  for (const m of xml.matchAll(/<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi)) {
    const b = m[1];
    const title = (b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/<\!\[CDATA\[|\]\]>/g, '').trim();
    const id = (b.match(/<(?:guid|id)[^>]*>([\s\S]*?)<\/(?:guid|id)>/i)?.[1] ?? '').trim();
    const href = b.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ?? b.match(/<link[^>]*>([^<]+)<\/link>/i)?.[1] ?? '';
    const raw = stripHtml(b);
    if (title) out.push({ id, title, raw, link: href.trim() });
  }
  return out;
}

async function fetchStatus(url: string): Promise<number> {
  const headers = { 'user-agent': UA };
  const head = await fetch(url, { method: 'HEAD', headers, signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (head) return head.status;
  return (await fetch(url, { headers, signal: AbortSignal.timeout(20000) })).status;
}

Deno.serve(async (req: Request) => {
  if (!authorized(req)) return json({ ok: false, error: 'unauthorized' }, 401);

  let xml: string;
  try {
    const response = await fetch(FEED, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, text/xml' }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`feed HTTP ${response.status}`);
    xml = await response.text();
  } catch (error) {
    return json({ ok: false, error: String(error) }, 502);
  }

  const items = parseFeed(xml);
  const results = [];
  for (const item of items) {
    const primary = extractPrimaryUrl(item.raw, item.link);
    if (!primary) { results.push({ title: item.title, status: 'BLOCKED', gate_result: 'FAIL_DOMAIN' }); continue; }
    const domain = extractDomain(primary);
    const source = findSource(domain)!;
    const { data: existing } = await supabase.from('news_discovery').select('id').eq('source_url', primary).maybeSingle();
    if (existing) { results.push({ title: item.title, status: 'DUPLICATE' }); continue; }
    const http = await fetchStatus(primary).catch(() => 0);
    const status = http >= 200 && http < 300 ? 'VERIFIED' : 'BLOCKED';
    const gate_result = status === 'VERIFIED' ? 'PASS' : 'FAIL_HTTP';
    const { error } = await supabase.from('news_discovery').insert({ feed_item_id: item.id, title: item.title, source_url: primary, source_domain: domain, status, gate_result, error: http ? null : `HTTP ${http}` });
    if (error) results.push({ title: item.title, status: 'ERROR', error: error.message });
    else results.push({ title: item.title, status, source: source.name });
  }
  return json({ ok: true, verified: items.length, results });
});