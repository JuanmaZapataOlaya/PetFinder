BEGIN;

DROP FUNCTION IF EXISTS public.search_pets(TEXT, extensions.vector(1536), INTEGER);

CREATE FUNCTION public.search_pets(
  search_query TEXT,
  query_embedding extensions.vector(1536),
  result_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id BIGINT,
  owner_id UUID,
  name TEXT,
  type TEXT,
  kind TEXT,
  status TEXT,
  location TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  image TEXT,
  color TEXT,
  breed TEXT,
  note TEXT,
  match_score SMALLINT,
  reported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  keyword_rank INTEGER,
  semantic_rank INTEGER,
  keyword_score DOUBLE PRECISION,
  semantic_score DOUBLE PRECISION,
  hybrid_score DOUBLE PRECISION
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH keyword_results AS (
    SELECT p.id, row_number() OVER (
      ORDER BY ts_rank_cd(p.search_vector, plainto_tsquery('spanish', search_query)) DESC, p.created_at DESC
    )::INTEGER AS rank
    FROM public.pet_tickets AS p
    WHERE nullif(trim(search_query), '') IS NOT NULL
      AND p.search_vector @@ plainto_tsquery('spanish', search_query)
    LIMIT result_limit
  ),
  semantic_results AS (
    SELECT p.id, row_number() OVER (
      ORDER BY p.description_embedding <=> query_embedding
    )::INTEGER AS rank
    FROM public.pet_tickets AS p
    WHERE query_embedding IS NOT NULL
      AND p.description_embedding IS NOT NULL
    ORDER BY p.description_embedding <=> query_embedding
    LIMIT result_limit
  ),
  ranked AS (
    SELECT id,
      MAX(keyword_rank)::INTEGER AS keyword_rank,
      MAX(semantic_rank)::INTEGER AS semantic_rank,
      COALESCE(MAX(keyword_score), 0)::DOUBLE PRECISION AS keyword_score,
      COALESCE(MAX(semantic_score), 0)::DOUBLE PRECISION AS semantic_score,
      SUM(score)::DOUBLE PRECISION AS hybrid_score
    FROM (
      SELECT id, rank AS keyword_rank, NULL::INTEGER AS semantic_rank,
        1.0 / (60 + rank) AS keyword_score, NULL::DOUBLE PRECISION AS semantic_score,
        1.0 / (60 + rank) AS score FROM keyword_results
      UNION ALL
      SELECT id, NULL::INTEGER AS keyword_rank, rank AS semantic_rank,
        NULL::DOUBLE PRECISION AS keyword_score, 1.0 / (60 + rank) AS semantic_score,
        1.0 / (60 + rank) AS score FROM semantic_results
    ) AS scores
    GROUP BY id
  )
  SELECT p.id, p.owner_id, p.name, p.type, p.kind, p.status, p.location,
    p.latitude, p.longitude, p.image, p.color, p.breed, p.note, p.match_score,
    p.reported_at, p.created_at, p.updated_at,
    r.keyword_rank, r.semantic_rank, r.keyword_score, r.semantic_score,
    COALESCE(r.hybrid_score, 0)::DOUBLE PRECISION AS hybrid_score
  FROM public.pet_tickets AS p
  LEFT JOIN ranked AS r ON r.id = p.id
  WHERE (nullif(trim(search_query), '') IS NULL AND query_embedding IS NULL)
     OR r.id IS NOT NULL
  ORDER BY hybrid_score DESC, p.created_at DESC
  LIMIT result_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.search_pets(TEXT, extensions.vector(1536), INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_pets(TEXT, extensions.vector(1536), INTEGER) TO authenticated, service_role;

COMMIT;