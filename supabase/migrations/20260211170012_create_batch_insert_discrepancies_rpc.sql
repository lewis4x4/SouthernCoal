-- Migration 020: batch_insert_discrepancies RPC for detect-discrepancies Edge Function
-- Handles bulk insert with partial unique index dedup (ON CONFLICT with WHERE clause)
-- PostgREST .upsert() cannot target partial unique indexes, so this RPC is required.

CREATE OR REPLACE FUNCTION batch_insert_discrepancies(rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_rows int;
  inserted_count int;
BEGIN
  total_rows := jsonb_array_length(rows);

  INSERT INTO discrepancy_reviews (
    organization_id, npdes_id, mine_id, source, discrepancy_type,
    severity, description, internal_value, external_value,
    internal_source_table, internal_source_id, external_source_id,
    monitoring_period_start, monitoring_period_end, status
  )
  SELECT
    (r->>'organization_id')::uuid,
    r->>'npdes_id',
    r->>'mine_id',
    r->>'source',
    r->>'discrepancy_type',
    r->>'severity',
    r->>'description',
    r->>'internal_value',
    r->>'external_value',
    r->>'internal_source_table',
    CASE WHEN r->>'internal_source_id' IS NOT NULL
         THEN (r->>'internal_source_id')::uuid ELSE NULL END,
    CASE WHEN r->>'external_source_id' IS NOT NULL
         THEN (r->>'external_source_id')::uuid ELSE NULL END,
    CASE WHEN r->>'monitoring_period_start' IS NOT NULL
         THEN (r->>'monitoring_period_start')::date ELSE NULL END,
    CASE WHEN r->>'monitoring_period_end' IS NOT NULL
         THEN (r->>'monitoring_period_end')::date ELSE NULL END,
    'pending'
  FROM jsonb_array_elements(rows) AS r
  ON CONFLICT (organization_id, source, discrepancy_type, npdes_id, monitoring_period_end, external_source_id)
    WHERE status IN ('pending', 'reviewed')
  DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'inserted', inserted_count,
    'skipped', total_rows - inserted_count,
    'total', total_rows
  );
END;
$$;
