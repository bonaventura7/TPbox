import { describe, expect, it } from 'vitest';
import { extractPrimaryUrl, isSpecificPrimaryUrl, parseFeed } from '../supabase/functions/_shared/feed-primary-url';

describe('RegFollower primary URL extraction', () => {
  it('preserves a specific institutional href before stripping HTML', () => {
    const raw = `
      <link>https://regfollower.com/chile-update/</link>
      <content:encoded><![CDATA[
        <p>SII <a href="https://www.sii.cl/noticias/2026/200726noti02smn.htm">announced</a> an update.</p>
      ]]></content:encoded>`;

    expect(extractPrimaryUrl(raw, 'https://regfollower.com/chile-update/')).toBe(
      'https://www.sii.cl/noticias/2026/200726noti02smn.htm',
    );
  });

  it('decodes query entities in official href values', () => {
    const raw = '<a href="https://www.canada.ca/en/finance/news.html?id=12&amp;lang=en">release</a>';
    expect(extractPrimaryUrl(raw, '')).toBe('https://www.canada.ca/en/finance/news.html?id=12&lang=en');
  });

  it('rejects institutional homepages as non-news URLs', () => {
    expect(isSpecificPrimaryUrl('https://www.nts.go.kr/')).toBe(false);
    expect(isSpecificPrimaryUrl('https://www.sii.cl/')).toBe(false);
    expect(extractPrimaryUrl('Visit https://www.sii.cl/', 'https://regfollower.com/item')).toBeNull();
  });

  it('keeps RegFollower and non-whitelisted document hosts discovery-only', () => {
    const raw = '<a href="https://drive.google.com/file/d/example/view">draft law</a>';
    expect(extractPrimaryUrl(raw, 'https://regfollower.com/item')).toBeNull();
  });

  it('keeps raw feed-item markup available for href extraction', () => {
    const xml = `<rss><channel><item>
      <title><![CDATA[Chile: SII update]]></title>
      <link>https://regfollower.com/chile-update/</link>
      <guid>item-1</guid>
      <description><![CDATA[<a href="https://www.sii.cl/noticias/update.htm">official</a>]]></description>
    </item></channel></rss>`;

    const [item] = parseFeed(xml);
    expect(item.title).toBe('Chile: SII update');
    expect(item.raw).toContain('href="https://www.sii.cl/noticias/update.htm"');
    expect(extractPrimaryUrl(item.raw, item.link)).toBe('https://www.sii.cl/noticias/update.htm');
  });
});
