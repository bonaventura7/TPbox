import { canonicalUrl, isSpecificPrimaryUrl } from './whitelist.ts';

export { isSpecificPrimaryUrl };

export type FeedItem = { id: string; title: string; raw: string; link: string };

export function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function normalizeCandidate(value: string): string | null {
  const cleaned = decodeXmlEntities(value).trim().replace(/[),.;]+$/, '');
  try {
    return new URL(cleaned).toString();
  } catch {
    return null;
  }
}

/**
 * RegFollower is discovery-only. Prefer institutional href values embedded in
 * the feed item, then visible URLs. The RegFollower item URL is only a fallback
 * candidate and can never pass the institutional whitelist.
 */
export function extractPrimaryUrl(raw: string, fallback: string): string | null {
  const decoded = decodeXmlEntities(raw);
  const hrefs = [...decoded.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  const visibleUrls = [...decoded.matchAll(/https?:\/\/[^\s"'<>]+/gi)].map((match) => match[0]);
  const seen = new Set<string>();

  for (const candidate of [...hrefs, ...visibleUrls, fallback]) {
    const normalized = normalizeCandidate(candidate);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    if (isSpecificPrimaryUrl(normalized)) return canonicalUrl(normalized);
  }

  return null;
}

export function parseFeed(xml: string): FeedItem[] {
  const out: FeedItem[] = [];

  for (const match of xml.matchAll(/<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi)) {
    const raw = match[1];
    const titleRaw = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
    const title = decodeXmlEntities(titleRaw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const id = decodeXmlEntities(raw.match(/<(?:guid|id)[^>]*>([\s\S]*?)<\/(?:guid|id)>/i)?.[1] ?? '').trim();
    const href = raw.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1]
      ?? raw.match(/<link[^>]*>([^<]+)<\/link>/i)?.[1]
      ?? '';

    if (title) out.push({ id, title, raw, link: decodeXmlEntities(href).trim() });
  }

  return out;
}
