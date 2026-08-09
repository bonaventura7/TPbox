-- Base schema for the Attualità pipeline.
--
-- This migration exists because it was missing. Every later migration assumes
-- public.news_items and public.news_sources already exist — 20260806120000 opens with
-- ALTER TABLE public.news_items and calls itself "_003" in its own comment — but the
-- tables were created by the Lovable agent directly against a database that is no longer
-- there. On the current database `select count(*) from information_schema.tables where
-- table_schema = 'public'` returns 0, so applying the folder failed on its first line.
--
-- Nothing here is invented. Every column is one the code actually reads or writes:
-- news-generate's insert into news_items, news-publish's gate input and status update,
-- news-monitor's select and retraction, the v_attualita and v_biblioteca column lists,
-- and the news_sources insert in 20260809010000.

create extension if not exists pgcrypto;

create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text,
  content_markdown text,
  -- news-generate maps the model's category through CATEGORY_DB before insert.
  category text check (category in ('TP','VAT','P2','AA')),
  country text,
  source_name text,
  source_url text,
  pdf_url text,
  -- Inserted as a string array by news-generate; news-publish reads it back with
  -- Array.isArray, so the column must round-trip a JSON array.
  normative_references jsonb not null default '[]'::jsonb,
  status text not null default 'DRAFT' check (status in ('DRAFT','IN_REVIEW','PUBLISHED','RETRACTED')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('TP','VAT','P2','AA')),
  country text,
  feed_url text,
  watch_type text not null default 'HTML_WATCH' check (watch_type in ('RSS','ATOM','HTML_WATCH')),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_news_items_status on public.news_items(status);
create index if not exists idx_news_items_published_at on public.news_items(published_at desc);

alter table public.news_items enable row level security;
alter table public.news_sources enable row level security;

-- v_attualita and v_biblioteca are declared with security_invoker = true, so the anon
-- caller's own RLS applies when reading through them. Without this policy the views
-- return nothing in the browser. The predicate is the same guarantee the views encode:
-- a draft never leaves the database, whatever the query.
drop policy if exists news_items_public_read on public.news_items;
create policy news_items_public_read on public.news_items
  for select to anon, authenticated
  using (status = 'PUBLISHED');

-- news_sources stays server-side. No policy is created, so anon and authenticated read
-- nothing; the service role bypasses RLS and the edge functions keep working.

comment on table public.news_items is 'Editorial items. Only PUBLISHED rows are readable by anon, enforced by RLS and again by the public views.';
comment on table public.news_sources is 'Primary institutional sources. Server-side only: no RLS policy grants public access.';
