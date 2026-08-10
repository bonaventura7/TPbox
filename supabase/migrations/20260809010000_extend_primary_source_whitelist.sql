-- Extend primary institutional sources without enabling unconfigured feeds.
-- The live schema uses name/category/country/feed_url, not domain/ente.
insert into public.news_sources (name, category, country, feed_url, watch_type, enabled)
values
  ('Federal Public Service Finance', 'P2', 'BE', null, 'HTML_WATCH', false),
  ('Bundesministerium der Finanzen', 'P2', 'DE', null, 'HTML_WATCH', false),
  ('Tax Department Cipro', 'VAT', 'CY', null, 'HTML_WATCH', false),
  ('Inland Revenue Board of Malaysia', 'TP', 'MY', null, 'HTML_WATCH', false),
  ('Ministerie van Financien', 'P2', 'NL', null, 'HTML_WATCH', false)
on conflict (name) do nothing;