-- K4: Finish bitemporal cols, exceedance_digest acks, ¶49 failure audit logging support.

-- Bitemporal on sampling_gap_detection_runs
ALTER TABLE sampling_gap_detection_runs
  ADD COLUMN IF NOT EXISTS valid_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS valid_to timestamptz,
  ADD COLUMN IF NOT EXISTS transaction_time timestamptz NOT NULL DEFAULT now();

-- Bitemporal on penalty_ledger_verifications
ALTER TABLE penalty_ledger_verifications
  ADD COLUMN IF NOT EXISTS valid_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS valid_to timestamptz,
  ADD COLUMN IF NOT EXISTS transaction_time timestamptz NOT NULL DEFAULT now();

-- Extend get_unacknowledged_statutory_alerts with exceedance_digest
CREATE OR REPLACE FUNCTION get_unacknowledged_statutory_alerts(
  p_organization_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, get_user_org_id());
  v_msha jsonb := '[]'::jsonb;
  v_edd jsonb := '[]'::jsonb;
  v_gaps jsonb := '[]'::jsonb;
  v_digest jsonb := '[]'::jsonb;
BEGIN
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_org');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'alert_type', 'msha_abatement',
    'alert_ref_id', r.id,
    'mine_id', r.mine_id,
    'violation_number', r.violation_number,
    'abatement_due_date', r.abatement_due_date,
    'urgency', r.urgency
  ) ORDER BY r.abatement_due_date), '[]'::jsonb)
  INTO v_msha
  FROM get_msha_abatement_at_risk(v_org_id, 14) r
  WHERE NOT EXISTS (
    SELECT 1 FROM alert_acknowledgments aa
    WHERE aa.organization_id = v_org_id
      AND aa.alert_type = 'msha_abatement'
      AND aa.alert_ref_id = r.id
      AND aa.valid_to IS NULL
  );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'alert_type', 'edd_paragraph49',
    'alert_ref_id', e.id,
    'lab_name', e.lab_name,
    'file_name', e.file_name,
    'is_late_48h', e.is_late_48h,
    'is_exceedance_only', e.is_exceedance_only,
    'review_status', e.review_status
  ) ORDER BY e.arrival_at DESC), '[]'::jsonb)
  INTO v_edd
  FROM edd_paragraph49_evaluations e
  WHERE e.organization_id = v_org_id
    AND (e.is_late_48h OR e.is_exceedance_only)
    AND e.review_status <> 'resolved'
    AND NOT EXISTS (
      SELECT 1 FROM alert_acknowledgments aa
      WHERE aa.organization_id = v_org_id
        AND aa.alert_type = 'edd_paragraph49'
        AND aa.alert_ref_id = e.id
        AND aa.valid_to IS NULL
    );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'alert_type', 'sampling_gap',
    'alert_ref_id', g.id,
    'gap_kind', g.gap_kind,
    'severity', g.severity,
    'scheduled_date', g.scheduled_date,
    'review_status', g.review_status
  ) ORDER BY g.scheduled_date), '[]'::jsonb)
  INTO v_gaps
  FROM sampling_gap_records g
  WHERE g.organization_id = v_org_id
    AND g.review_status = 'pending'
    AND g.gap_kind IN ('missed', 'at_risk')
    AND NOT EXISTS (
      SELECT 1 FROM alert_acknowledgments aa
      WHERE aa.organization_id = v_org_id
        AND aa.alert_type = 'sampling_gap'
        AND aa.alert_ref_id = g.id
        AND aa.valid_to IS NULL
    );

  -- Exceedance digest: open exceedances in last 7 days not yet acked
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'alert_type', 'exceedance_digest',
    'alert_ref_id', e.id,
    'parameter_name', p.name,
    'outfall_number', o.outfall_number,
    'detected_at', e.detected_at,
    'severity', e.severity
  ) ORDER BY e.detected_at DESC), '[]'::jsonb)
  INTO v_digest
  FROM exceedances e
  JOIN lab_results lr ON lr.id = e.lab_result_id
  JOIN sampling_events se ON se.id = lr.sampling_event_id
  JOIN outfalls o ON o.id = se.outfall_id
  JOIN parameters p ON p.id = lr.parameter_id
  WHERE e.organization_id = v_org_id
    AND e.status NOT IN ('resolved', 'closed')
    AND e.detected_at >= now() - interval '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM alert_acknowledgments aa
      WHERE aa.organization_id = v_org_id
        AND aa.alert_type = 'exceedance_digest'
        AND aa.alert_ref_id = e.id
        AND aa.valid_to IS NULL
    );

  RETURN jsonb_build_object(
    'msha_abatement', v_msha,
    'edd_paragraph49', v_edd,
    'sampling_gap', v_gaps,
    'exceedance_digest', v_digest,
    'counts', jsonb_build_object(
      'msha_abatement', jsonb_array_length(v_msha),
      'edd_paragraph49', jsonb_array_length(v_edd),
      'sampling_gap', jsonb_array_length(v_gaps),
      'exceedance_digest', jsonb_array_length(v_digest),
      'total',
        jsonb_array_length(v_msha) + jsonb_array_length(v_edd)
        + jsonb_array_length(v_gaps) + jsonb_array_length(v_digest)
    )
  );
END;
$$;

-- RPC for import-lab-data to audit-log ¶49 evaluation failures
CREATE OR REPLACE FUNCTION log_edd_paragraph49_evaluation_failure(
  p_organization_id uuid,
  p_import_id uuid,
  p_error_message text,
  p_source_file_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_log (
    organization_id,
    action,
    module,
    table_name,
    record_id,
    new_values,
    description
  ) VALUES (
    p_organization_id,
    'edd_paragraph49_evaluation_failed',
    'environmental_compliance',
    'edd_paragraph49_evaluations',
    p_import_id,
    jsonb_build_object(
      'import_id', p_import_id,
      'source_file_id', p_source_file_id,
      'error', p_error_message
    ),
    'CD ¶49 EDD evaluation failed during lab import (degraded — import succeeded)'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION log_edd_paragraph49_evaluation_failure(uuid, uuid, text, uuid) TO service_role;
