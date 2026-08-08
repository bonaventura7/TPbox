-- Attualità: additive source-gate layer.
-- Existing news schema is preserved; this migration adds verification/audit tables and safe public views.

create table if not exists public.news_discovery (
  id uuid primary key default gen_random_uuid(),
  feed_item_id text,
  title text not null,
  source_url text not null,
  source_domain text not null,
  scouted_at timestamptz not null default now(),
  status text not null default 'SCOUTED' check (status in ('SCOUTED','VERIFIED','GENERATED','PUBLISHED','BLOCKED','RETRACTED')),
  gate_result text check (gate_result in ('PASS','FAIL_DOMAIN','FAIL_HTTP','FAIL_DUP','FAIL_PDF','FAIL_REF','FAIL_EMPTY','FAIL_UNKNOWN')),
  pdf_url text,
  pdf_path text,
  error text,
  created_at timestamptz not null default now(),
  unique (source_url)
);

create table if not exists public.normative (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  url_official text,
  created_at timestamptz not null default now()
);

create table if not exists public.news_gate_log (
  id uuid primary key default gen_random_uuid(),
  news_id uuid references public.news_items(id) on delete set null,
  gate_result text not null check (gate_result in ('PASS','FAIL_DOMAIN','FAIL_HTTP','FAIL_DUP','FAIL_PDF','FAIL_REF','FAIL_EMPTY','FAIL_UNKNOWN')),
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);

insert into public.normative (key, description) values
  ('art. 110 c. 7 TUIR', 'Transfer pricing e principio di libera concorrenza'),
  ('D.Lgs. 209/2023', 'Pillar Two e imposta minima globale'),
  ('art. 10-bis L. 212/2000', 'Disciplina anti-abuso'),
  ('ATAD UE 2016/1164', 'Direttiva anti-elusione'),
  ('OECD TP Guidelines 2022', 'Linee guida OCSE sui prezzi di trasferimento')
on conflict (key) do nothing;

create index if not exists idx_news_discovery_status on public.news_discovery(status);
create index if not exists idx_news_discovery_gate on public.news_discovery(gate_result);
create index if not exists idx_news_gate_log_news on public.news_gate_log(news_id, checked_at desc);

alter table public.news_discovery enable row level security;
alter table public.normative enable row level security;
alter table public.news_gate_log enable row level security;

-- Public clients may read only normative reference data. Discovery/gate logs remain server-side.
drop policy if exists normative_public_read on public.normative;
create policy normative_public_read on public.normative for select to anon, authenticated using (true);

create or replace view public.v_attualita
with (security_invoker = true)
as
select id, slug, title, summary, content_markdown, category, country,
       source_name, source_url, pdf_url, normative_references, published_at,
       created_at, updated_at
from public.news_items
where status = 'PUBLISHED';

create or replace view public.v_biblioteca
with (security_invoker = true)
as
select id, title, category, country, source_name, pdf_url, source_url, published_at
from public.news_items
where status = 'PUBLISHED' and pdf_url is not null;

-- Keep the kill-switch explicit. Publishing is never enabled by this migration.
comment on table public.news_gate_log is 'Immutable audit trail for source-gate decisions; publishing must require PASS.';
comment on column public.news_items.status is 'Editorial state. Source-gate functions may move GENERATED to PUBLISHED only when AUTO_PUBLISH_ENABLED=true and every gate check passes.';
