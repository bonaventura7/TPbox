alter table public.company_registry_sources
  add column if not exists official_register_host text,
  add column if not exists official_information_host text;

update public.company_registry_sources
set official_register_host = lower((regexp_match(official_register_url, '^https://([^/]+)'))[1]),
    official_information_host = lower((regexp_match(official_information_url, '^https://([^/]+)'))[1]),
    updated_at = now();

alter table public.company_registry_sources
  alter column official_register_host set not null,
  alter column official_information_host set not null;

alter table public.company_registry_sources
  drop constraint if exists company_registry_sources_terms_status_check;

alter table public.company_registry_sources
  add constraint company_registry_sources_terms_status_check
  check (terms_status in ('VERIFIED','UNDER_REVIEW'));

alter table public.company_registry_sources
  drop constraint if exists company_registry_sources_register_host_match;

alter table public.company_registry_sources
  add constraint company_registry_sources_register_host_match
  check (lower((regexp_match(official_register_url, '^https://([^/]+)'))[1]) = lower(official_register_host));

alter table public.company_registry_sources
  drop constraint if exists company_registry_sources_information_host_match;

alter table public.company_registry_sources
  add constraint company_registry_sources_information_host_match
  check (lower((regexp_match(official_information_url, '^https://([^/]+)'))[1]) = lower(official_information_host));
