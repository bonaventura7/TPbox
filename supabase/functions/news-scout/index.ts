import { createClient } from 'jsr:@supabase/supabase-js@2';
import { authorizeCaller, jsonResponse } from '../_shared/auth.ts';
import { extractDomain, findSource } from '../_shared/whitelist.ts';
import { extractPrimaryUrl, parseFeed } from '../_shared/feed-primary-url.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FEED = Deno.env.get('REGFOLLOWER_FEED') ?? 'https://regfollower.com/feed/';
const UA = 'TPBox-Attualita-Bot/1.0';
const authClient = createClient(SUPABASE_URL, ANON_KEY);

async function fetchStatus(url: string): Promise<number> {
  const headers = { 'user-agent': UA };
  const head = await fetch(url, { method: 'HEAD', headers, signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (head) return head.status;
  return (await fetch(url, { headers, signal: AbortSignal.timeout(20000) })).status;
}

Deno.serve(async (req: Request) => {
  const auth = await authorizeCaller(req, authClient, Deno.env.get('NEWS_SCOUT_CALLER_USER_ID'), 'news-scout');
  if (!auth.ok) return auth.response;
  const { correlationId: cid } = auth;

  // Service-role client is created only after caller authorization has passed.
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  console.log(JSON.stringify({ event: 'news-scout.start', correlation_id: cid }));

  let xml: string;
  try {
    const response = await fetch(FEED, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, text/xml' }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`feed HTTP ${response.status}`);
    xml = await response.text();
  } catch (error) {
    console.error(JSON.stringify({ event: 'news-scout.feed_failed', correlation_id: cid, error: String(error) }));
    return jsonResponse({ ok: false, error: 'upstream_fetch_failed' }, 502, cid);
  }

  const items = parseFeed(xml);
  const results = [];
  let verified = 0;
  let blocked = 0;

  for (const item of items) {
    const primary = extractPrimaryUrl(item.raw, item.link);
    if (!primary) { blocked++; results.push({ title: item.title, status: 'BLOCKED', gate_result: 'FAIL_DOMAIN' }); continue; }
    const domain = extractDomain(primary);
    const source = findSource(domain)!;
    const { data: existing } = await supabase.from('news_discovery').select('id').eq('source_url', primary).maybeSingle();
    if (existing) { results.push({ title: item.title, status: 'DUPLICATE' }); continue; }
    const http = await fetchStatus(primary).catch(() => 0);
    const ok = http >= 200 && http < 300;
    const status = ok ? 'VERIFIED' : 'BLOCKED';
    if (ok) verified++; else blocked++;
    const gate_result = ok ? 'PASS' : 'FAIL_HTTP';
    // Fix: l'errore HTTP va registrato SEMPRE quando non-2xx; null solo quando ok.
    const errorDetail = ok ? null : (http > 0 ? `HTTP ${http}` : 'network error (HTTP 0)');
    const { error } = await supabase.from('news_discovery').insert({ feed_item_id: item.id, title: item.title, source_url: primary, source_domain: domain, status, gate_result, error: errorDetail });
    if (error) results.push({ title: item.title, status: 'ERROR', error: error.message });
    else results.push({ title: item.title, status, source: source.name });
  }

  console.log(JSON.stringify({ event: 'news-scout.complete', correlation_id: cid, discovered: items.length, verified, blocked }));
  return jsonResponse({ ok: true, discovered: items.length, verified, blocked, results }, 200, cid);
});
