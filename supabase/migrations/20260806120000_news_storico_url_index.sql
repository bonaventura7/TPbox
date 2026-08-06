-- migration _003: indice univoco su source_url per deduplication O(1)
-- e colonna fetched_at per tracciare quando l'item è stato recuperato dal feed

-- Indice univoco: impedisce duplicati a livello DB (safety net)
-- isDuplicate() in Edge Function fa già il check, ma questo è il guard definitivo
CREATE UNIQUE INDEX IF NOT EXISTS news_items_source_url_unique
  ON public.news_items (source_url)
  WHERE source_url IS NOT NULL;

-- Colonna fetched_at: timestamp di quando il monitor ha scaricato l'articolo
-- Distinta da published_at (= quando l'editor pubblica sul portale)
ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS fetched_at timestamptz DEFAULT now();

-- Indice su fetched_at per query di monitoraggio ingestion pipeline
CREATE INDEX IF NOT EXISTS news_items_fetched_at_idx
  ON public.news_items (fetched_at DESC);

-- Commento descrittivo sulle colonne chiave
COMMENT ON COLUMN public.news_items.source_url IS
  'URL canonico della fonte primaria istituzionale. Usato per deduplication. Zero link ad aggregator terzi.';

COMMENT ON COLUMN public.news_items.fetched_at IS
  'Timestamp di ingestion dal feed RSS/Atom. Distinto da published_at che richiede approvazione umana.';

COMMENT ON COLUMN public.news_items.status IS
  'Workflow editoriale: DRAFT (default ingestion) → IN_REVIEW → PUBLISHED. Solo PUBLISHED è visibile in portale.';
