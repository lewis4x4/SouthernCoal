-- Migration 011: Create match_document_chunks RPC for vector similarity search
-- Uses L2 distance (<->) for compatibility with all pgvector versions.
-- SET search_path includes extensions so vector operators resolve correctly.

CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding extensions.vector(384),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_org_id uuid DEFAULT NULL,
  filter_state text DEFAULT NULL,
  filter_document_type text DEFAULT NULL,
  filter_permit_number text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_index integer,
  chunk_text text,
  source_page integer,
  source_section text,
  document_type text,
  state_code text,
  permit_number text,
  file_name text,
  similarity float
)
LANGUAGE plpgsql STABLE
SECURITY INVOKER
SET search_path = extensions, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.chunk_text,
    dc.source_page,
    dc.source_section,
    dc.document_type,
    dc.state_code,
    dc.permit_number,
    dc.file_name,
    -- For normalized vectors: cosine_similarity = 1 - (L2^2 / 2)
    GREATEST(0, 1.0 - (power(dc.embedding <-> query_embedding, 2)) / 2.0)::float AS similarity
  FROM document_chunks dc
  WHERE
    (filter_org_id IS NULL OR dc.organization_id = filter_org_id)
    AND (dc.embedding <-> query_embedding) < sqrt(2.0 * (1.0 - match_threshold))
    AND (filter_state IS NULL OR dc.state_code = filter_state)
    AND (filter_document_type IS NULL OR dc.document_type = filter_document_type)
    AND (filter_permit_number IS NULL OR dc.permit_number = filter_permit_number)
  ORDER BY dc.embedding <-> query_embedding ASC
  LIMIT LEAST(match_count, 50);
END;
$$;
