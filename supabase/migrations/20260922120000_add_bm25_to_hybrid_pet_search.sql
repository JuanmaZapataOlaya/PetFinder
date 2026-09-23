BEGIN;

CREATE OR REPLACE FUNCTION public.tsvector_term_frequency(
  document_vector TSVECTOR,
  term TEXT
)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
STRICT
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN strpos(token, ':') = 0 THEN 1
        ELSE length(split_part(token, ':', 2))
          - length(replace(split_part(token, ':', 2), ',', '')) + 1
      END
      FROM unnest(string_to_array(document_vector::TEXT, ' ')) AS tokens(token)
      WHERE split_part(token, ':', 1) = quote_literal(term)
      LIMIT 1
    ),
    0
  );
$$;

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
  WITH query_terms AS (
    SELECT DISTINCT regexp_replace(term, '''', '', 'g') AS term
    FROM regexp_split_to_table(
      plainto_tsquery('spanish', search_query)::TEXT,
      '\s*&\s*'
    ) AS term
    WHERE term <> ''
  ),
  corpus_stats AS (
    SELECT
      COUNT(*)::DOUBLE PRECISION AS document_count,
      GREATEST(
        AVG(array_length(tsvector_to_array(p.search_vector), 1)),
        1
      )::DOUBLE PRECISION AS average_document_length
    FROM public.pet_tickets AS p
    WHERE p.search_vector IS NOT NULL
  ),
  term_stats AS (
    SELECT word, ndoc
    FROM ts_stat('SELECT search_vector FROM public.pet_tickets')
  ),
  term_matches AS (
    SELECT
      p.id,
      public.tsvector_term_frequency(p.search_vector, query_terms.term)::DOUBLE PRECISION AS term_frequency,
      GREATEST(
        LN(
          (
            corpus.document_count - COALESCE(stats.ndoc, 0) + 0.5
          ) / (COALESCE(stats.ndoc, 0) + 0.5)
        ),
        0
      ) AS inverse_document_frequency,
      array_length(tsvector_to_array(p.search_vector), 1)::DOUBLE PRECISION AS document_length,
      corpus.average_document_length
    FROM public.pet_tickets AS p
    CROSS JOIN query_terms
    CROSS JOIN corpus_stats AS corpus
    LEFT JOIN term_stats AS stats ON stats.word = query_terms.term
    WHERE nullif(trim(search_query), '') IS NOT NULL
      AND p.search_vector @@ to_tsquery('simple', quote_literal(query_terms.term))
  ),
  bm25_results AS (
    SELECT
      id,
      SUM(
        inverse_document_frequency * (term_frequency * (1.2 + 1)) / (
          term_frequency + 1.2 * (
            1 - 0.75
            + 0.75 * document_length / average_document_length
          )
        )
      )::DOUBLE PRECISION AS score
    FROM term_matches
    WHERE term_frequency > 0
    GROUP BY id
    HAVING SUM(
      inverse_document_frequency * (term_frequency * (1.2 + 1)) / (
        term_frequency + 1.2 * (
          1 - 0.75
          + 0.75 * document_length / average_document_length
        )
      )
    ) > 0
  ),
  keyword_results AS (
    SELECT
      id,
      score,
      row_number() OVER (ORDER BY score DESC, id DESC)::INTEGER AS rank
    FROM bm25_results
    ORDER BY score DESC, id DESC
    LIMIT result_limit
  ),
  semantic_results AS (
    SELECT
      p.id,
      row_number() OVER (
        ORDER BY p.description_embedding <=> query_embedding
      )::INTEGER AS rank
    FROM public.pet_tickets AS p
    WHERE query_embedding IS NOT NULL
      AND p.description_embedding IS NOT NULL
    ORDER BY p.description_embedding <=> query_embedding
    LIMIT result_limit
  ),
  ranked AS (
    SELECT
      id,
      MAX(keyword_rank)::INTEGER AS keyword_rank,
      MAX(semantic_rank)::INTEGER AS semantic_rank,
      COALESCE(MAX(keyword_score), 0)::DOUBLE PRECISION AS keyword_score,
      COALESCE(MAX(semantic_score), 0)::DOUBLE PRECISION AS semantic_score,
      SUM(score)::DOUBLE PRECISION AS hybrid_score
    FROM (
      SELECT
        id,
        rank AS keyword_rank,
        NULL::INTEGER AS semantic_rank,
        score AS keyword_score,
        NULL::DOUBLE PRECISION AS semantic_score,
        1.0 / (60 + rank) AS score
      FROM keyword_results
      UNION ALL
      SELECT
        id,
        NULL::INTEGER AS keyword_rank,
        rank AS semantic_rank,
        NULL::DOUBLE PRECISION AS keyword_score,
        1.0 / (60 + rank) AS semantic_score,
        1.0 / (60 + rank) AS score
      FROM semantic_results
    ) AS scores
    GROUP BY id
  )
  SELECT
    p.id,
    p.owner_id,
    p.name,
    p.type,
    p.kind,
    p.status,
    p.location,
    p.latitude,
    p.longitude,
    p.image,
    p.color,
    p.breed,
    p.note,
    p.match_score,
    p.reported_at,
    p.created_at,
    p.updated_at,
    r.keyword_rank,
    r.semantic_rank,
    r.keyword_score,
    r.semantic_score,
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
REVOKE EXECUTE ON FUNCTION public.tsvector_term_frequency(TSVECTOR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tsvector_term_frequency(TSVECTOR, TEXT) TO authenticated, service_role;

COMMIT;
