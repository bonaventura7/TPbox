begin;

-- Additive, idempotent governance for the public news feed.
alter table if exists public.news_items
  add column if not exists needs_review boolean not null default false;

create index if not exists idx_news_items_published_at
  on public.news_items (published_at desc)
  where status = 'PUBLISHED';

alter table if exists public.news_items enable row level security;

-- Public readers may see published items only. No write policy is granted to anon.
drop policy if exists "news_items_public_read_published" on public.news_items;
create policy "news_items_public_read_published"
  on public.news_items
  for select
  to anon, authenticated
  using (status = 'PUBLISHED');

-- Editorial workflow remains server-side / role controlled.
drop policy if exists "news_items_editor_update_workflow" on public.news_items;
create policy "news_items_editor_update_workflow"
  on public.news_items
  for update
  to authenticated
  using ((auth.jwt() ->> 'app_role') in ('EDITOR', 'ADMIN'))
  with check ((auth.jwt() ->> 'app_role') in ('EDITOR', 'ADMIN'));

create or replace view public.v_news_published
with (security_invoker = true) as
select
  id,
  coalesce(title_it, title) as it_title,
  summary as it_summary,
  content as it_content,
  references as it_references,
  source_url as primary_source_url,
  source_name,
  category,
  country,
  status,
  published_at,
  fetched_at,
  disclaimer,
  needs_review,
  ai_metadata
from public.news_items
where status = 'PUBLISHED';

grant select on public.v_news_published to anon, authenticated;

commit;
