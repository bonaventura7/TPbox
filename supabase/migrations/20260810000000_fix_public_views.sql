-- ============================================================================
-- 20260810000000_fix_public_views.sql
-- TP BOX — Attualità: viste pubbliche con le colonne che il frontend pretende.
-- news.repo.mapping.ts richiede geo, topic, original_url, original_date,
-- source_kind e category già mappata. Senza, ogni riga viene scartata.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_attualita
WITH (security_invoker = true)
AS
SELECT
  id, slug, title, summary, content_markdown,
  CASE upper(category)
    WHEN 'TP'  THEN 'Transfer Pricing'
    WHEN 'P2'  THEN 'Pillar Two'
    WHEN 'VAT' THEN 'VAT'
    WHEN 'AA'  THEN 'Anti-Avoidance'
    ELSE NULL
  END AS category,
  country, source_name, source_url, pdf_url, normative_references,
  published_at, created_at, updated_at,
  source_url   AS original_url,
  published_at AS original_date,
  'ISTITUZIONALE' AS source_kind,
  CASE
    WHEN lower(country) = 'italia' THEN 'ITALIA'
    WHEN lower(country) IN ('germania','francia','belgio','paesi bassi','cipro','spagna','portogallo','irlanda','polonia','lussemburgo','austria') THEN 'UE'
    WHEN lower(country) IN ('ocse','oecd') THEN 'OCSE'
    ELSE 'GLOBALE'
  END AS geo,
  CASE upper(category)
    WHEN 'P2'  THEN 'Pillar Two'
    WHEN 'VAT' THEN 'Documentazione'
    WHEN 'AA'  THEN 'Contenzioso'
    ELSE 'Metodi e comparabili'
  END AS topic
FROM public.news_items
WHERE status = 'PUBLISHED';

CREATE OR REPLACE VIEW public.v_biblioteca
WITH (security_invoker = true)
AS
SELECT
  id, title,
  CASE upper(category)
    WHEN 'TP'  THEN 'Transfer Pricing'
    WHEN 'P2'  THEN 'Pillar Two'
    WHEN 'VAT' THEN 'VAT'
    WHEN 'AA'  THEN 'Anti-Avoidance'
    ELSE NULL
  END AS category,
  country, source_name, pdf_url, source_url, published_at,
  source_url   AS original_url,
  published_at AS original_date,
  'ISTITUZIONALE' AS source_kind,
  CASE
    WHEN lower(country) = 'italia' THEN 'ITALIA'
    WHEN lower(country) IN ('germania','francia','belgio','paesi bassi','cipro','spagna','portogallo','irlanda','polonia','lussemburgo','austria') THEN 'UE'
    WHEN lower(country) IN ('ocse','oecd') THEN 'OCSE'
    ELSE 'GLOBALE'
  END AS geo,
  CASE upper(category)
    WHEN 'P2'  THEN 'Pillar Two'
    WHEN 'VAT' THEN 'Documentazione'
    WHEN 'AA'  THEN 'Contenzioso'
    ELSE 'Metodi e comparabili'
  END AS topic
FROM public.news_items
WHERE status = 'PUBLISHED' AND pdf_url IS NOT NULL;

GRANT SELECT ON public.v_attualita  TO anon, authenticated;
GRANT SELECT ON public.v_biblioteca TO anon, authenticated;
