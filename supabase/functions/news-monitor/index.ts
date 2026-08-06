import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface NewsSource {
  id: string;
  name: string;
  feed_url: string;
  watch_type: "RSS" | "ATOM" | "HTML_WATCH";
  category: string;
  country: string;
  enabled: boolean;
}

interface FeedItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
}

// ──────────────────────────────────────────────
// RSS/Atom parser (minimal, no deps)
// ──────────────────────────────────────────────
function parseXmlFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];

  // Support both <item> (RSS) and <entry> (Atom)
  const itemRegex = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const title =
      block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() ?? "";

    // RSS uses <link>, Atom uses <link href="..."> or <id>
    const linkTag = block.match(/<link[^>]+href=["']([^"']+)["']/)?.[1]
      ?? block.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/)?.[1]?.trim()
      ?? block.match(/<id[^>]*>([\s\S]*?)<\/id>/)?.[1]?.trim()
      ?? "";

    const pubDate =
      block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/)?.[1]?.trim()
      ?? block.match(/<published[^>]*>([\s\S]*?)<\/published>/)?.[1]?.trim()
      ?? block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/)?.[1]?.trim();

    const description =
      block.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]?.trim()
      ?? block.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/)?.[1]?.trim()
      ?? "";

    if (title && linkTag) {
      items.push({ title, link: linkTag, pubDate, description });
    }
  }

  return items;
}

// ──────────────────────────────────────────────
// isDuplicate — controlla per source_url (canonical)
// NON usa MD5/content_hash per evitare falsi negativi
// su articoli aggiornati con stesso link
// ──────────────────────────────────────────────
async function isDuplicate(
  supabase: ReturnType<typeof createClient>,
  sourceUrl: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("news_items")
    .select("id")
    .eq("source_url", sourceUrl)
    .maybeSingle();

  if (error) {
    console.error("[isDuplicate] error:", error.message);
    return false; // permissive: meglio un duplicato che perdere un articolo
  }
  return data !== null;
}

// ──────────────────────────────────────────────
// Slug generator
// ──────────────────────────────────────────────
function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[àáâãäå]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .substring(0, 80);
}

// ──────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────
Deno.serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Carica fonti abilitate
  const { data: sources, error: srcErr } = await supabase
    .from("news_sources")
    .select("*")
    .eq("enabled", true);

  if (srcErr || !sources) {
    return new Response(
      JSON.stringify({ error: "Impossibile caricare le fonti", detail: srcErr?.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const results: Record<string, { fetched: number; inserted: number; skipped: number; error?: string }> = {};

  // 2. Per ogni fonte RSS/Atom fetchabile
  for (const src of sources as NewsSource[]) {
    const r = { fetched: 0, inserted: 0, skipped: 0, error: undefined as string | undefined };
    results[src.name] = r;

    if (src.watch_type === "HTML_WATCH") {
      // HTML_WATCH: non gestito automaticamente — richiede revisore umano
      r.skipped = -1; // segnale: skip intenzionale
      continue;
    }

    try {
      const resp = await fetch(src.feed_url, {
        headers: { "User-Agent": "TransferGuideItalia-NewsMonitor/1.0" },
        signal: AbortSignal.timeout(10_000),
      });

      if (!resp.ok) {
        r.error = `HTTP ${resp.status}`;
        await supabase
          .from("news_sources")
          .update({ fail_count: (src as any).fail_count + 1, health_status: "ERROR" })
          .eq("id", src.id);
        continue;
      }

      const xml = await resp.text();
      const items = parseXmlFeed(xml);
      r.fetched = items.length;

      for (const item of items) {
        if (!item.link) { r.skipped++; continue; }

        // ── DEDUPLICATION via source_url (canonical check) ──
        const alreadyExists = await isDuplicate(supabase, item.link);
        if (alreadyExists) { r.skipped++; continue; }

        // ── Costruisci il draft ──
        const slug = `${toSlug(item.title)}-${Date.now()}`;
        const rawDate = item.pubDate ? new Date(item.pubDate) : new Date();
        const fetchedAt = isNaN(rawDate.getTime()) ? new Date() : rawDate;

        const { error: insErr } = await supabase.from("news_items").insert({
          slug,
          title: item.title,
          summary: (item.description ?? "").replace(/<[^>]*>/g, "").substring(0, 500),
          category: src.category,
          country: src.country,
          source_name: src.name,
          source_url: item.link,
          status: "DRAFT",           // SEMPRE draft — pubblicazione richiede review umana
          fetched_at: fetchedAt.toISOString(),
          // published_at: null       — il trigger enforce_published_at lo protegge
        });

        if (insErr) {
          r.error = insErr.message;
          r.skipped++;
        } else {
          r.inserted++;
        }
      }

      // Aggiorna health_status fonte
      await supabase
        .from("news_sources")
        .update({ health_status: "OK", fail_count: 0, last_fetched_at: new Date().toISOString() })
        .eq("id", src.id);

    } catch (err) {
      r.error = String(err);
      await supabase
        .from("news_sources")
        .update({ fail_count: (src as any).fail_count + 1, health_status: "ERROR" })
        .eq("id", src.id);
    }
  }

  const totalInserted = Object.values(results).reduce((s, v) => s + v.inserted, 0);
  const totalSkipped  = Object.values(results).reduce((s, v) => s + (v.skipped > 0 ? v.skipped : 0), 0);

  return new Response(
    JSON.stringify({ ok: true, totalInserted, totalSkipped, sources: results }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
