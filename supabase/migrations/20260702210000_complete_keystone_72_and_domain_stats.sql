-- Complete §7.2 keystone schema discipline functions (idempotent CREATE OR REPLACE)
-- Also adds Upload Dashboard domain stats RPC for v6 §12 summary_stats_accuracy.

-- ---------------------------------------------------------------------------
-- 1. detect_sampling_calendar_gaps — coupled work_orders + valid_to on resolve
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION detect_sampling_calendar_gaps(
  p_organization_id uuid DEFAULT NULL,
  p_as_of date DEFAULT CURRENT_DATE,
  p_at_risk_horizon_days integer DEFAULT 2,
  p_source text DEFAULT 'scheduled'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, get_user_org_id());
  v_run_id uuid;
  v_scanned integer := 0;
  v_opened integer := 0;
  v_updated integer := 0;
  v_resolved integer := 0;
  rec RECORD;
  v_effective_due date;
  v_days_late integer;
  v_days_until integer;
  v_gap_kind text;
  v_severity text;
  v_existing_id uuid;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required for gap detection';
  END IF;

  IF p_source NOT IN ('scheduled', 'manual') THEN
    RAISE EXCEPTION 'Invalid detection source: %', p_source;
  END IF;

  INSERT INTO sampling_gap_detection_runs (organization_id, as_of_date, source, status)
  VALUES (v_org_id, p_as_of, p_source, 'running')
  RETURNING id INTO v_run_id;

  INSERT INTO audit_log (
    organization_id, action, module, table_name, record_id, new_values, description
  ) VALUES (
    v_org_id, 'sampling_gap_detection_started', 'environmental_compliance',
    'sampling_gap_detection_runs', v_run_id,
    jsonb_build_object('as_of_date', p_as_of, 'source', p_source, 'at_risk_horizon_days', p_at_risk_horizon_days),
    'Calendar gap detection run started'
  );

  PERFORM refresh_sampling_calendar_statuses(v_org_id, p_as_of);

  WITH resolved AS (
    UPDATE sampling_gap_records sgr
    SET review_status = 'resolved', resolved_at = now(), valid_to = now(), updated_at = now(),
        review_notes = COALESCE(review_notes, 'Auto-resolved: lab result or documented field outcome detected')
    WHERE sgr.organization_id = v_org_id AND sgr.review_status <> 'resolved'
      AND (sampling_calendar_has_lab_result(sgr.calendar_id) OR sampling_calendar_is_documented_excuse(sgr.calendar_id))
    RETURNING sgr.work_order_id
  ),
  close_work_orders AS (
    UPDATE work_orders wo
    SET status = 'completed', completed_at = now(),
        notes = COALESCE(wo.notes, '') || ' Auto-closed: gap resolved by lab result or documented excuse.'
    FROM resolved r
    WHERE wo.id = r.work_order_id AND wo.status IN ('open', 'assigned', 'in_progress')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_resolved FROM resolved;

  FOR rec IN
    SELECT sc.id AS calendar_id, sc.outfall_id, sc.parameter_id, sc.scheduled_date,
      COALESCE(sc.window_end, sc.scheduled_date) AS effective_due, sc.dispatch_status,
      sc.status AS calendar_status, sc.skip_reason, fv.outcome AS field_visit_outcome,
      fv.visit_status AS field_visit_status
    FROM sampling_calendar sc
    LEFT JOIN field_visits fv ON fv.id = sc.current_field_visit_id
    WHERE sc.organization_id = v_org_id
      AND NOT sampling_calendar_has_lab_result(sc.id)
      AND NOT sampling_calendar_is_documented_excuse(sc.id)
      AND sc.status NOT IN ('cancelled')
  LOOP
    v_scanned := v_scanned + 1;
    v_effective_due := rec.effective_due;
    v_days_late := GREATEST(0, p_as_of - v_effective_due);
    v_days_until := GREATEST(0, v_effective_due - p_as_of);

    IF v_effective_due < p_as_of THEN v_gap_kind := 'missed';
    ELSIF v_effective_due <= p_as_of + p_at_risk_horizon_days THEN v_gap_kind := 'at_risk';
    ELSE CONTINUE;
    END IF;

    v_severity := sampling_calendar_gap_severity(v_gap_kind, v_days_late, v_days_until);

    SELECT id INTO v_existing_id FROM sampling_gap_records
    WHERE calendar_id = rec.calendar_id AND review_status <> 'resolved' LIMIT 1;

    IF v_existing_id IS NULL THEN
      PERFORM open_sampling_gap_with_work_order(
        v_org_id, v_run_id, rec.calendar_id, v_gap_kind, v_severity,
        rec.scheduled_date, rec.effective_due, v_days_late,
        rec.dispatch_status, rec.calendar_status, rec.field_visit_outcome,
        rec.field_visit_status, rec.skip_reason, rec.outfall_id, rec.parameter_id
      );
      v_opened := v_opened + 1;
    ELSE
      UPDATE sampling_gap_records SET detection_run_id = v_run_id, gap_kind = v_gap_kind,
        severity = v_severity, days_late = v_days_late, dispatch_status = rec.dispatch_status,
        calendar_status = rec.calendar_status, field_visit_outcome = rec.field_visit_outcome,
        field_visit_status = rec.field_visit_status, skip_reason = rec.skip_reason,
        window_end = rec.effective_due, last_detected_at = now(), updated_at = now()
      WHERE id = v_existing_id;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  UPDATE sampling_gap_detection_runs SET finished_at = now(), calendars_scanned = v_scanned,
    gaps_opened = v_opened, gaps_updated = v_updated, gaps_resolved = v_resolved, status = 'completed',
    metadata = jsonb_build_object('at_risk_horizon_days', p_at_risk_horizon_days)
  WHERE id = v_run_id;

  INSERT INTO audit_log (organization_id, action, module, table_name, record_id, new_values, description)
  VALUES (v_org_id, 'sampling_gap_detection_completed', 'environmental_compliance',
    'sampling_gap_detection_runs', v_run_id,
    jsonb_build_object('calendars_scanned', v_scanned, 'gaps_opened', v_opened,
      'gaps_updated', v_updated, 'gaps_resolved', v_resolved),
    'Calendar gap detection run completed');

  RETURN jsonb_build_object('run_id', v_run_id, 'organization_id', v_org_id,
    'calendars_scanned', v_scanned, 'gaps_opened', v_opened, 'gaps_updated', v_updated, 'gaps_resolved', v_resolved);
EXCEPTION WHEN OTHERS THEN
  UPDATE sampling_gap_detection_runs SET finished_at = now(), status = 'failed', error_message = SQLERRM WHERE id = v_run_id;
  INSERT INTO audit_log (organization_id, action, module, table_name, record_id, new_values, description)
  VALUES (v_org_id, 'sampling_gap_detection_failed', 'environmental_compliance',
    'sampling_gap_detection_runs', v_run_id, jsonb_build_object('error', SQLERRM),
    'Calendar gap detection run failed');
  RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. get_penalty_ledger_summary — citation + verification_status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_penalty_ledger_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := get_user_org_id();
  v_fts numeric := 0; v_fts_events integer := 0;
  v_gap_estimate numeric := 0; v_gap_missed integer := 0;
  v_obligations numeric := 0; v_obligations_count integer := 0;
  v_violations numeric := 0; v_violations_count integer := 0;
  v_verification jsonb := '{}'::jsonb; v_sources jsonb;
  v_verification_status text := 'draft';
BEGIN
  IF v_org_id IS NULL THEN RETURN jsonb_build_object('error', 'no_org'); END IF;
  PERFORM refresh_penalty_exposure_lines(v_org_id);

  SELECT COALESCE(SUM(penalty_amount), 0), COUNT(*)::int INTO v_fts, v_fts_events FROM fts_violations WHERE organization_id = v_org_id;
  SELECT COALESCE(SUM(calculate_draft_miss_sampling_penalty(days_late)), 0), COUNT(*)::int INTO v_gap_estimate, v_gap_missed
  FROM sampling_gap_records WHERE organization_id = v_org_id AND gap_kind = 'missed' AND review_status NOT IN ('resolved', 'force_majeure');
  SELECT COALESCE(SUM(accrued_penalty), 0), COUNT(*)::int INTO v_obligations, v_obligations_count
  FROM consent_decree_obligations WHERE status IN ('active', 'overdue') AND accrued_penalty > 0;
  SELECT COALESCE(SUM(COALESCE(actual_penalty, estimated_penalty, 0)), 0), COUNT(*)::int INTO v_violations, v_violations_count
  FROM compliance_violations WHERE organization_id = v_org_id AND status NOT IN ('closed', 'resolved');

  SELECT jsonb_build_object('id', id, 'verified_at', verified_at, 'verified_by', verified_by, 'note', note, 'coverage_summary', coverage_summary)
  INTO v_verification FROM penalty_ledger_verifications
  WHERE organization_id = v_org_id AND is_active = true ORDER BY verified_at DESC LIMIT 1;

  IF v_verification ? 'verified_at' THEN v_verification_status := 'verified'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'key', source_key, 'label', label, 'amount', amount, 'event_count', event_count,
    'confidence', confidence, 'citation', citation, 'verification_status', verification_status
  ) ORDER BY source_key), '[]'::jsonb)
  INTO v_sources FROM penalty_exposure_lines
  WHERE organization_id = v_org_id AND valid_to IS NULL
    AND snapshot_at = (SELECT MAX(snapshot_at) FROM penalty_exposure_lines pel2 WHERE pel2.organization_id = v_org_id);

  RETURN jsonb_build_object(
    'organization_id', v_org_id, 'computed_at', now(), 'verification_status', v_verification_status,
    'latest_verification', COALESCE(v_verification, '{}'::jsonb), 'sources', COALESCE(v_sources, '[]'::jsonb),
    'totals', jsonb_build_object('draft_combined', v_fts + v_gap_estimate + v_obligations + v_violations,
      'uploaded_only', v_fts, 'estimated_gaps', v_gap_estimate),
    'data_coverage', jsonb_build_object('fts_rows', v_fts_events, 'open_gaps', v_gap_missed,
      'obligations_with_penalty', v_obligations_count, 'open_violations', v_violations_count),
    'disclaimer', 'DRAFT — internal estimate, not verified for external or legal use'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_penalty_ledger_summary() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Upload Dashboard domain stats (v6 §12 check #5)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_upload_dashboard_domain_stats(p_organization_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, get_user_org_id());
  v_permits integer := 0;
  v_outfalls integer := 0;
  v_limits integer := 0;
BEGIN
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_org');
  END IF;

  SELECT COUNT(*)::int INTO v_permits FROM npdes_permits WHERE organization_id = v_org_id;
  SELECT COUNT(*)::int INTO v_outfalls
  FROM outfalls o JOIN npdes_permits np ON np.id = o.permit_id WHERE np.organization_id = v_org_id;
  SELECT COUNT(*)::int INTO v_limits
  FROM permit_limits pl JOIN npdes_permits np ON np.id = pl.permit_id WHERE np.organization_id = v_org_id;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'total_permits', v_permits,
    'total_outfalls', v_outfalls,
    'total_limits', v_limits,
    'computed_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_upload_dashboard_domain_stats(uuid) TO authenticated;
