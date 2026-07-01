-- Lane C QW3: Defensible-miss packet (flanking samples + collector access fingerprint)

CREATE OR REPLACE FUNCTION get_flanking_samples_for_gap(p_gap_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gap sampling_gap_records%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
BEGIN
  SELECT * INTO v_gap
  FROM sampling_gap_records
  WHERE id = p_gap_id
    AND organization_id = get_user_org_id()
    AND gap_kind = 'missed';

  IF v_gap.id IS NULL THEN
    RAISE EXCEPTION 'Missed gap record not found or not accessible';
  END IF;

  SELECT jsonb_build_object(
    'lab_result_id', lr.id,
    'sample_date', se.sample_date,
    'result_value', lr.result_value,
    'result_text', lr.result_text,
    'unit', lr.unit,
    'is_non_detect', lr.is_non_detect,
    'analyzed_date', lr.analyzed_date
  ) INTO v_before
  FROM sampling_events se
  JOIN lab_results lr ON lr.sampling_event_id = se.id AND lr.parameter_id = v_gap.parameter_id
  WHERE se.outfall_id = v_gap.outfall_id
    AND se.sample_date < v_gap.scheduled_date
    AND NOT EXISTS (SELECT 1 FROM exceedances e WHERE e.lab_result_id = lr.id)
  ORDER BY se.sample_date DESC
  LIMIT 1;

  SELECT jsonb_build_object(
    'lab_result_id', lr.id,
    'sample_date', se.sample_date,
    'result_value', lr.result_value,
    'result_text', lr.result_text,
    'unit', lr.unit,
    'is_non_detect', lr.is_non_detect,
    'analyzed_date', lr.analyzed_date
  ) INTO v_after
  FROM sampling_events se
  JOIN lab_results lr ON lr.sampling_event_id = se.id AND lr.parameter_id = v_gap.parameter_id
  WHERE se.outfall_id = v_gap.outfall_id
    AND se.sample_date > v_gap.scheduled_date
    AND NOT EXISTS (SELECT 1 FROM exceedances e WHERE e.lab_result_id = lr.id)
  ORDER BY se.sample_date ASC
  LIMIT 1;

  INSERT INTO audit_log (
    organization_id,
    action,
    module,
    table_name,
    record_id,
    new_values,
    description
  ) VALUES (
    v_gap.organization_id,
    'defensible_miss_packet_generated',
    'environmental_compliance',
    'sampling_gap_records',
    v_gap.id,
    jsonb_build_object(
      'gap_id', v_gap.id,
      'has_before', v_before IS NOT NULL,
      'has_after', v_after IS NOT NULL,
      'scheduled_date', v_gap.scheduled_date
    ),
    'Defensible-miss flanking sample packet generated (advisory — not legal conclusion)'
  );

  RETURN jsonb_build_object(
    'gap_id', v_gap.id,
    'outfall_id', v_gap.outfall_id,
    'parameter_id', v_gap.parameter_id,
    'scheduled_date', v_gap.scheduled_date,
    'days_late', v_gap.days_late,
    'before_sample', v_before,
    'after_sample', v_after,
    'defense_note',
      'DRAFT — flanking clean samples for counsel review only; not a compliance or legal conclusion.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_collector_access_anomalies(
  p_org_id uuid DEFAULT NULL,
  p_lookback_days integer DEFAULT 365
)
RETURNS TABLE (
  collector_id uuid,
  collector_name text,
  access_issue_count bigint,
  no_discharge_count bigint,
  completed_visits bigint,
  access_issue_rate_pct numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_org_id, get_user_org_id());
  v_caller_org uuid := get_user_org_id();
BEGIN
  IF v_org_id != v_caller_org THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    fv.assigned_to AS collector_id,
    COALESCE(up.first_name || ' ' || up.last_name, up.email, 'Unknown') AS collector_name,
    COUNT(*) FILTER (WHERE fv.outcome = 'access_issue') AS access_issue_count,
    COUNT(*) FILTER (WHERE fv.outcome = 'no_discharge') AS no_discharge_count,
    COUNT(*) AS completed_visits,
    ROUND(
      (COUNT(*) FILTER (WHERE fv.outcome = 'access_issue')::numeric / NULLIF(COUNT(*), 0)) * 100,
      1
    ) AS access_issue_rate_pct
  FROM field_visits fv
  LEFT JOIN user_profiles up ON up.id = fv.assigned_to
  WHERE fv.organization_id = v_org_id
    AND fv.visit_status = 'completed'
    AND fv.scheduled_date >= CURRENT_DATE - p_lookback_days
    AND fv.assigned_to IS NOT NULL
  GROUP BY fv.assigned_to, up.first_name, up.last_name, up.email
  HAVING COUNT(*) FILTER (WHERE fv.outcome = 'access_issue') > 0
  ORDER BY access_issue_count DESC, completed_visits DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_flanking_samples_for_gap(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_collector_access_anomalies(uuid, integer) TO authenticated;

COMMENT ON FUNCTION get_flanking_samples_for_gap IS
  'Lane C QW3 — nearest clean lab results before/after a missed calendar event (counsel evidence aid).';

COMMENT ON FUNCTION get_collector_access_anomalies IS
  'Lane C QW3 — collectors with access_issue field visit outcomes (habitual road-closed pattern signal).';
