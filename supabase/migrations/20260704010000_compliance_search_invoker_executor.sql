-- Restore compliance-search query executor with SECURITY INVOKER so RLS applies to caller.
-- Replaces SECURITY DEFINER version dropped in post_build_audit_round2_fixes.

CREATE OR REPLACE FUNCTION public.execute_readonly_query(
  query_text text,
  query_params jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET statement_timeout = '10s'
SET search_path = public
AS $$
DECLARE
  result jsonb;
  params text[];
  sql_text text;
  i int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (upper(trim(query_text)) LIKE 'SELECT%') THEN
    RAISE EXCEPTION 'Only SELECT queries are permitted';
  END IF;

  SELECT array_agg(elem) INTO params
  FROM jsonb_array_elements_text(query_params) AS elem;

  sql_text := query_text;
  IF params IS NOT NULL THEN
    FOR i IN REVERSE array_length(params, 1)..1 LOOP
      sql_text := replace(sql_text, '$' || i, quote_literal(params[i]));
    END LOOP;
  END IF;

  EXECUTE format(
    'SELECT jsonb_agg(row_to_json(t)) FROM (%s) t',
    sql_text
  )
  INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.execute_readonly_query(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_readonly_query(text, jsonb) TO authenticated;
