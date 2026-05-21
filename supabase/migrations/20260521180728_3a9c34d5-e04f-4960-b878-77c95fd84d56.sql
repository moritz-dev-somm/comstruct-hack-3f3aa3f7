
-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add columns to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS search_document text,
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. Populate search_document for existing rows from existing fields
UPDATE public.products
SET search_document =
  'Product: ' || coalesce(name, '') ||
  '. Category: ' || coalesce(category, '') ||
  '. Description: ' || coalesce(description, '') ||
  '. Keywords: ' || coalesce(array_to_string(keywords, ', '), '') ||
  '. Supplier: ' || coalesce(supplier, '') ||
  '. Unit: ' || coalesce(unit, '');

-- 4. Trigger to keep search_document in sync on insert/update
CREATE OR REPLACE FUNCTION public.products_build_search_document()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.search_document :=
    'Product: ' || coalesce(NEW.name, '') ||
    '. Category: ' || coalesce(NEW.category, '') ||
    '. Description: ' || coalesce(NEW.description, '') ||
    '. Keywords: ' || coalesce(array_to_string(NEW.keywords, ', '), '') ||
    '. Supplier: ' || coalesce(NEW.supplier, '') ||
    '. Unit: ' || coalesce(NEW.unit, '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_build_search_document ON public.products;
CREATE TRIGGER trg_products_build_search_document
  BEFORE INSERT OR UPDATE OF name, category, description, keywords, supplier, unit
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.products_build_search_document();

-- 5. HNSW index for cosine distance
CREATE INDEX IF NOT EXISTS products_embedding_hnsw_idx
  ON public.products
  USING hnsw (embedding vector_cosine_ops);

-- 6. Hybrid search RPC
CREATE OR REPLACE FUNCTION public.hybrid_search_materials(
  user_embedding vector(1536),
  category_filter text DEFAULT NULL,
  keyword_filters text[] DEFAULT NULL,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  sku text,
  name text,
  category text,
  description text,
  price_eur numeric,
  unit text,
  supplier text,
  keywords text[],
  similarity float,
  keyword_score int,
  hybrid_score float
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH scored AS (
    SELECT
      p.sku,
      p.name,
      p.category,
      p.description,
      p.price_eur,
      p.unit,
      p.supplier,
      p.keywords,
      CASE
        WHEN p.embedding IS NULL OR user_embedding IS NULL THEN 0.0
        ELSE 1 - (p.embedding <=> user_embedding)
      END AS similarity,
      CASE
        WHEN keyword_filters IS NULL OR array_length(keyword_filters, 1) IS NULL THEN 0
        ELSE (
          SELECT count(*)::int
          FROM unnest(keyword_filters) AS kw
          WHERE
            p.name ILIKE '%' || kw || '%'
            OR coalesce(p.description, '') ILIKE '%' || kw || '%'
            OR EXISTS (
              SELECT 1 FROM unnest(p.keywords) AS pk
              WHERE pk ILIKE '%' || kw || '%'
            )
        )
      END AS keyword_score
    FROM public.products p
    WHERE category_filter IS NULL OR p.category = category_filter
  )
  SELECT
    sku, name, category, description, price_eur, unit, supplier, keywords,
    similarity,
    keyword_score,
    (similarity + (keyword_score * 0.15)) AS hybrid_score
  FROM scored
  WHERE
    -- Keep candidates that match either semantically or by keyword
    keyword_filters IS NULL
    OR array_length(keyword_filters, 1) IS NULL
    OR keyword_score > 0
    OR similarity > 0.3
  ORDER BY hybrid_score DESC, price_eur ASC
  LIMIT GREATEST(5, LEAST(match_count, 10));
$$;

-- 7. Final result re-ordered cheapest-first (wrapper preserves hybrid scoring)
CREATE OR REPLACE FUNCTION public.hybrid_search_materials_cheap_first(
  user_embedding vector(1536),
  category_filter text DEFAULT NULL,
  keyword_filters text[] DEFAULT NULL,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  sku text,
  name text,
  category text,
  description text,
  price_eur numeric,
  unit text,
  supplier text,
  keywords text[],
  similarity float,
  keyword_score int,
  hybrid_score float
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT * FROM public.hybrid_search_materials(user_embedding, category_filter, keyword_filters, match_count)
  ORDER BY price_eur ASC;
$$;
