alter table public.news_items
  add column if not exists flag_pending_review boolean not null default false;

alter table public.news_items
  add column if not exists gate_result jsonb;

comment on column public.news_items.flag_pending_review is
  'true = record in attesa di revisione umana: non pubblicabile.';
comment on column public.news_items.gate_result is
  'Esito del gate editoriale: {"ok": boolean, "reasons": string[]}. ok=true e'' condizione necessaria per la pubblicazione.';

update public.news_items
set status = 'DRAFT',
    flag_pending_review = true,
    gate_result = jsonb_build_object(
      'ok', false,
      'reasons', jsonb_build_array(
        'articolo troppo breve: ' || coalesce(length(content_markdown), 0) || ' caratteri (minimo 900)',
        'retrofix 20260827: pubblicazione avvenuta senza gate editoriale superato'
      )
    ),
    updated_at = now()
where status = 'PUBLISHED'
  and coalesce(length(content_markdown), 0) < 900
  and (gate_result is null or coalesce((gate_result->>'ok')::boolean, false) = false);