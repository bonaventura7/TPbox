-- Add the distinct Bundesfinanzdirektion primary source mapping.
-- Category must satisfy the live news_sources check constraint (TP/VAT/P2/AA).
insert into public.news_sources (name, category, country, feed_url, watch_type, enabled)
values ('Bundesfinanzdirektion (bfd.de)', 'P2', 'DE', null, 'HTML_WATCH', false)
on conflict (name) do nothing;