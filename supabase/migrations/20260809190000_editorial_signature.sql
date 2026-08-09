-- Chi firma un articolo, e chi ha verificato la fonte primaria.
--
-- La regola editoriale del portale è che RegFollower apre l'indagine e solo la fonte
-- primaria verificata la chiude. Finora quella regola viveva in un documento. Qui
-- diventa un vincolo del database: nessuna riga può passare a PUBLISHED senza un
-- revisore con nome e cognome. Vale identica per gli articoli scritti a mano oggi e per
-- quelli che la pipeline produrrà domani, quindi accendere l'automazione non allenta
-- nulla e non richiede di riscrivere la garanzia da un'altra parte.

alter table public.news_items
  add column if not exists author_type text not null default 'HUMAN' check (author_type in ('HUMAN','AI_ASSISTED')),
  add column if not exists reviewed_by text,
  add column if not exists primary_source_verified_at timestamptz;

alter table public.news_items drop constraint if exists news_items_published_requires_reviewer;
alter table public.news_items add constraint news_items_published_requires_reviewer
  check (status <> 'PUBLISHED' or (reviewed_by is not null and length(btrim(reviewed_by)) > 0));

comment on column public.news_items.author_type is
  'HUMAN = redazione umana. AI_ASSISTED = bozza generata e poi revisionata. In entrambi i casi PUBLISHED richiede reviewed_by.';
comment on column public.news_items.reviewed_by is
  'Nome della persona che risponde del contenuto. Senza questo valore la riga non puo essere PUBLISHED: lo impone un check constraint, non una convenzione applicativa.';
comment on column public.news_items.primary_source_verified_at is
  'Momento in cui una persona ha verificato la fonte primaria. Nulla lo deduce automaticamente.';

-- create or replace non puo riordinare le colonne di una vista esistente: le nuove
-- vanno accodate, non inserite in mezzo.
create or replace view public.v_attualita
with (security_invoker = true)
as
select id, slug, title, summary, content_markdown, category, country,
       source_name, source_url, pdf_url, normative_references, published_at,
       created_at, updated_at,
       author_type, reviewed_by, primary_source_verified_at
from public.news_items
where status = 'PUBLISHED';
