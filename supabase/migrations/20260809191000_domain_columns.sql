-- Colonne di dominio richieste da NewsItem e assenti dalla tabella.
--
-- Il tipo del frontend chiede geo, topic, language, natura e rango della fonte. La
-- tabella non li aveva. L'alternativa sarebbe stata dedurli — geo dal country, topic
-- dalla categoria, il rango della fonte dal fatto che il dominio è in whitelist — ma
-- dedurre qui significa inventare, in una sezione la cui unica regola è non inventare.
-- I default riflettono l'invariante di oggi, non una scorciatoia: la whitelist ammette
-- solo fonti istituzionali primarie e la redazione scrive in italiano.
--
-- source_tier in particolare esiste perché il giorno in cui si ammetteranno dottrina o
-- working paper, la distinzione fra primaria e secondaria dovrà essere un dato scritto e
-- verificato, non una conseguenza del dominio da cui arriva il link.

alter table public.news_items
  add column if not exists geo text not null default 'GLOBALE'
    check (geo in ('OCSE','UE','ITALIA','GLOBALE')),
  add column if not exists topic text not null default 'Documentazione'
    check (topic in ('Metodi e comparabili','Intangibili','Servizi infragruppo','Pillar Two','APA e MAP','Documentazione','Contenzioso')),
  add column if not exists language text not null default 'it'
    check (language in ('it','en','fr')),
  add column if not exists source_kind text not null default 'ISTITUZIONALE'
    check (source_kind in ('ISTITUZIONALE','PROFESSIONALE','ACCADEMICA')),
  add column if not exists source_tier text not null default 'PRIMARY'
    check (source_tier in ('PRIMARY','SECONDARY'));

comment on column public.news_items.source_tier is
  'PRIMARY per la fonte istituzionale originale. Esplicito nel dato perche il giorno in cui si ammettera dottrina o working paper la distinzione non potra essere dedotta dal dominio.';

create or replace view public.v_attualita
with (security_invoker = true)
as
select id, slug, title, summary, content_markdown, category, country,
       source_name, source_url, pdf_url, normative_references, published_at,
       created_at, updated_at,
       author_type, reviewed_by, primary_source_verified_at,
       geo, topic, language, source_kind, source_tier
from public.news_items
where status = 'PUBLISHED';
