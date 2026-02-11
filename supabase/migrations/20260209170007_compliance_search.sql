-- Migration 007: Layer 1 — Internal Knowledge Search
-- Creates execute_readonly_query function + rate-limit index

-- execute_readonly_query: SECURITY DEFINER function for safe SQL execution
-- 10s timeout, SELECT-only validation, returns JSONB
CREATE OR REPLACE FUNCTION execute_readonly_query(
  query_text text,
  query_params jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '10s'
SET search_path = public
AS $$
DECLARE
  result jsonb;
  params text[];
  sql_text text;
  i int;
BEGIN
  -- Verify SELECT only
  IF NOT (upper(trim(query_text)) LIKE 'SELECT%') THEN
    RAISE EXCEPTION 'Only SELECT queries are permitted';
  END IF;

  -- Build params array from JSONB
  SELECT array_agg(elem) INTO params
  FROM jsonb_array_elements_text(query_params) AS elem;

  -- Replace $N placeholders with quoted values (reverse order to avoid $1 matching $10)
  sql_text := query_text;
  IF params IS NOT NULL THEN
    FOR i IN REVERSE array_length(params, 1)..1 LOOP
      sql_text := replace(sql_text, '$' || i, quote_literal(params[i]));
    END LOOP;
  END IF;

  -- Execute the resolved query
  EXECUTE format(
    'SELECT jsonb_agg(row_to_json(t)) FROM (%s) t',
    sql_text
  )
  INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION execute_readonly_query TO authenticated;

-- Index for rate limiting: count recent searches per user
CREATE INDEX IF NOT EXISTS idx_audit_log_search_rate_limit
  ON audit_log(user_id, action, created_at)
  WHERE action = 'compliance_search';
