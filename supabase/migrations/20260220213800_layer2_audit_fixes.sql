-- Layer 2 Audit Fixes
-- P0: Make external_sync_log.organization_id NOT NULL (no NULL rows exist)
ALTER TABLE external_sync_log
  ALTER COLUMN organization_id SET NOT NULL;

-- P1: Add recurrence tracking to discrepancy_reviews
ALTER TABLE discrepancy_reviews
  ADD COLUMN IF NOT EXISTS recurrence_count integer NOT NULL DEFAULT 1;

-- P1: Update batch_insert_discrepancies to bump recurrence on conflict
CREATE OR REPLACE FUNCTION batch_insert_discrepancies(rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_rows int;
  inserted_count int;
  updated_count int;
BEGIN
  total_rows := jsonb_array_length(rows);

  WITH upserted AS (
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
    DO UPDATE SET
      recurrence_count = discrepancy_reviews.recurrence_count + 1,
      updated_at = now()
    RETURNING (xmax = 0) AS was_inserted
  )
  SELECT
    count(*) FILTER (WHERE was_inserted),
    count(*) FILTER (WHERE NOT was_inserted)
  INTO inserted_count, updated_count
  FROM upserted;

  RETURN jsonb_build_object(
    'inserted', inserted_count,
    'skipped', total_rows - inserted_count - updated_count,
    'updated', updated_count,
    'total', total_rows
  );
END;
$$;

-- P2: CHECK constraints on enum-like columns
ALTER TABLE discrepancy_reviews
  ADD CONSTRAINT chk_dr_source CHECK (source IN ('echo', 'msha'));
ALTER TABLE discrepancy_reviews
  ADD CONSTRAINT chk_dr_severity CHECK (severity IN ('critical', 'high', 'medium', 'low'));
ALTER TABLE discrepancy_reviews
  ADD CONSTRAINT chk_dr_status CHECK (status IN ('pending', 'reviewed', 'dismissed', 'escalated', 'resolved'));
ALTER TABLE discrepancy_reviews
  ADD CONSTRAINT chk_dr_type CHECK (discrepancy_type IN ('missing_internal', 'missing_external', 'value_mismatch', 'status_mismatch'));

-- P2: Indexes on triage workflow columns
CREATE INDEX IF NOT EXISTS idx_dr_reviewed_at ON discrepancy_reviews(reviewed_at) WHERE reviewed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dr_resolved_at ON discrepancy_reviews(resolved_at) WHERE resolved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eed_param_code ON external_echo_dmrs(parameter_code);
