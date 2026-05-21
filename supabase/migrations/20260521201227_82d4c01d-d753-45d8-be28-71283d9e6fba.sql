CREATE OR REPLACE FUNCTION public.hybrid_search_materials(user_embedding vector, category_filter text DEFAULT NULL::text, keyword_filters text[] DEFAULT NULL::text[], match_count integer DEFAULT 10)
 RETURNS TABLE(sku text, name text, category text, description text, price_eur numeric, unit text, supplier text, keywords text[], similarity double precision, keyword_score integer, hybrid_score double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH normalized_kw AS (
    SELECT DISTINCT kw_norm
    FROM (
      SELECT lower(trim(kw)) AS kw_norm
      FROM unnest(coalesce(keyword_filters, ARRAY[]::text[])) AS kw
      WHERE trim(kw) <> ''
      UNION
      -- Add singular form when the keyword ends in 's' and is longer than 3 chars
      SELECT left(lower(trim(kw)), length(trim(kw)) - 1) AS kw_norm
      FROM unnest(coalesce(keyword_filters, ARRAY[]::text[])) AS kw
      WHERE length(trim(kw)) > 3 AND lower(trim(kw)) LIKE '%s'
    ) sub
    WHERE kw_norm <> ''
  ),
  scored AS (
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
          FROM normalized_kw nk
          WHERE
            lower(p.name) LIKE '%' || nk.kw_norm || '%'
            OR lower(coalesce(p.name_en, '')) LIKE '%' || nk.kw_norm || '%'
            OR lower(coalesce(p.description, '')) LIKE '%' || nk.kw_norm || '%'
            OR lower(coalesce(p.description_en, '')) LIKE '%' || nk.kw_norm || '%'
            OR EXISTS (
              SELECT 1 FROM unnest(p.keywords) AS pk
              WHERE lower(pk) LIKE '%' || nk.kw_norm || '%'
            )
            OR EXISTS (
              SELECT 1 FROM unnest(coalesce(p.keywords_en, ARRAY[]::text[])) AS pk
              WHERE lower(pk) LIKE '%' || nk.kw_norm || '%'
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
    keyword_filters IS NULL
    OR array_length(keyword_filters, 1) IS NULL
    OR keyword_score > 0
    OR similarity > 0.05
  ORDER BY hybrid_score DESC, price_eur ASC
  LIMIT GREATEST(5, LEAST(match_count, 10));
$function$;