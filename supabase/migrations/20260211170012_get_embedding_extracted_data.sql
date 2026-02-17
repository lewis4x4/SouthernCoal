-- Migration 018: RPC function to return truncated extracted_data for embedding
-- Prevents WORKER_LIMIT on large lab data files (3.5MB+ JSON) by capping
-- the records array server-side before sending to the Edge Function.

CREATE OR REPLACE FUNCTION get_embedding_extracted_data(
  p_queue_id uuid,
  p_max_records int DEFAULT 20
)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT
    CASE
      WHEN extracted_data IS NULL THEN NULL
      WHEN extracted_data->'records' IS NULL THEN extracted_data
      WHEN jsonb_array_length(extracted_data->'records') <= p_max_records THEN extracted_data
      ELSE (
        (extracted_data - 'records') ||
        jsonb_build_object(
          'records', (
            SELECT COALESCE(jsonb_agg(r), '[]'::jsonb)
            FROM (
              SELECT r
              FROM jsonb_array_elements(extracted_data->'records') AS r
              LIMIT p_max_records
            ) sub
          ),
          'records_truncated', true,
          'records_total', jsonb_array_length(extracted_data->'records')
        )
      )
    END
  FROM file_processing_queue
  WHERE id = p_queue_id;
$$;
