-- Code-review remediation (DB-1): tenant isolation for SECURITY DEFINER RPCs.
--
-- Several org-scoped RPCs resolved their target org as
--   COALESCE(p_organization_id, get_user_org_id())
-- which let any authenticated user pass another tenant's UUID and read (or, for
-- the two mutating functions, write) that tenant's data — SECURITY DEFINER
-- bypasses RLS. This migration introduces resolve_scoped_org_id() and rewires
-- each function so a JWT user is pinned to their own org while service-role /
-- cron callers (no JWT org context) may still target any org.

-- ---------------------------------------------------------------------------
-- Helper: resolve the effective org for a scoped RPC, enforcing tenant match.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_scoped_org_id(p_requested uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := get_user_org_id();
BEGIN
  -- Service role / cron (no JWT org context): trust the requested org (may be NULL).
  IF v_caller IS NULL THEN
    RETURN p_requested;
  END IF;
  -- Authenticated user: may only target their own org.
  IF p_requested IS NOT NULL AND p_requested <> v_caller THEN
    RAISE EXCEPTION 'Access denied: organization mismatch';
  END IF;
  RETURN v_caller;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_scoped_org_id(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_unacknowledged_statutory_alerts — read guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_unacknowledged_statutory_alerts(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_org_id uuid := resolve_scoped_org_id(p_organization_id); v_msha jsonb := '[]'::jsonb; v_edd jsonb := '[]'::jsonb; v_gaps jsonb := '[]'::jsonb; BEGIN IF v_org_id IS NULL THEN RETURN jsonb_build_object('error', 'no_org'); END IF; SELECT COALESCE(jsonb_agg(jsonb_build_object('alert_type', 'msha_abatement', 'alert_ref_id', r.id, 'mine_id', r.mine_id, 'violation_number', r.violation_number, 'abatement_due_date', r.abatement_due_date, 'urgency', r.urgency) ORDER BY r.abatement_due_date), '[]'::jsonb) INTO v_msha FROM get_msha_abatement_at_risk(v_org_id, 14) r WHERE NOT EXISTS (SELECT 1 FROM alert_acknowledgments aa WHERE aa.organization_id = v_org_id AND aa.alert_type = 'msha_abatement' AND aa.alert_ref_id = r.id AND aa.valid_to IS NULL); SELECT COALESCE(jsonb_agg(jsonb_build_object('alert_type', 'edd_paragraph49', 'alert_ref_id', e.id, 'lab_name', e.lab_name, 'file_name', e.file_name, 'is_late_48h', e.is_late_48h, 'is_exceedance_only', e.is_exceedance_only, 'review_status', e.review_status) ORDER BY e.arrival_at DESC), '[]'::jsonb) INTO v_edd FROM edd_paragraph49_evaluations e WHERE e.organization_id = v_org_id AND (e.is_late_48h OR e.is_exceedance_only) AND e.review_status <> 'resolved' AND NOT EXISTS (SELECT 1 FROM alert_acknowledgments aa WHERE aa.organization_id = v_org_id AND aa.alert_type = 'edd_paragraph49' AND aa.alert_ref_id = e.id AND aa.valid_to IS NULL); SELECT COALESCE(jsonb_agg(jsonb_build_object('alert_type', 'sampling_gap', 'alert_ref_id', g.id, 'gap_kind', g.gap_kind, 'severity', g.severity, 'scheduled_date', g.scheduled_date, 'review_status', g.review_status) ORDER BY g.scheduled_date), '[]'::jsonb) INTO v_gaps FROM sampling_gap_records g WHERE g.organization_id = v_org_id AND g.review_status = 'pending' AND g.gap_kind IN ('missed', 'at_risk') AND NOT EXISTS (SELECT 1 FROM alert_acknowledgments aa WHERE aa.organization_id = v_org_id AND aa.alert_type = 'sampling_gap' AND aa.alert_ref_id = g.id AND aa.valid_to IS NULL); RETURN jsonb_build_object('msha_abatement', v_msha, 'edd_paragraph49', v_edd, 'sampling_gap', v_gaps, 'counts', jsonb_build_object('msha_abatement', jsonb_array_length(v_msha), 'edd_paragraph49', jsonb_array_length(v_edd), 'sampling_gap', jsonb_array_length(v_gaps), 'total', jsonb_array_length(v_msha) + jsonb_array_length(v_edd) + jsonb_array_length(v_gaps))); END; $function$;

-- ---------------------------------------------------------------------------
-- get_upload_dashboard_domain_stats — read guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_upload_dashboard_domain_stats(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid := resolve_scoped_org_id(p_organization_id);
  v_permits integer := 0; v_outfalls integer := 0; v_limits integer := 0;
BEGIN
  IF v_org_id IS NULL THEN RETURN jsonb_build_object('error', 'no_org'); END IF;
  SELECT COUNT(*)::int INTO v_permits FROM npdes_permits WHERE organization_id = v_org_id;
  SELECT COUNT(*)::int INTO v_outfalls FROM outfalls o JOIN npdes_permits np ON np.id = o.permit_id WHERE np.organization_id = v_org_id;
  SELECT COUNT(*)::int INTO v_limits FROM permit_limits pl JOIN npdes_permits np ON np.id = pl.permit_id WHERE np.organization_id = v_org_id;
  RETURN jsonb_build_object('organization_id', v_org_id, 'total_permits', v_permits, 'total_outfalls', v_outfalls, 'total_limits', v_limits, 'computed_at', now());
END;
$function$;

-- ---------------------------------------------------------------------------
-- refresh_penalty_exposure_lines — write guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_penalty_exposure_lines(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid := resolve_scoped_org_id(p_organization_id);
  v_verification_status text := 'draft';
  v_fts numeric := 0;
  v_fts_events integer := 0;
  v_gap_estimate numeric := 0;
  v_gap_missed integer := 0;
  v_obligations numeric := 0;
  v_obligations_count integer := 0;
  v_violations numeric := 0;
  v_violations_count integer := 0;
  v_snapshot timestamptz := now();
BEGIN
  IF v_org_id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM penalty_ledger_verifications WHERE organization_id = v_org_id AND is_active = true) THEN
    v_verification_status := 'verified';
  END IF;
  SELECT COALESCE(SUM(penalty_amount), 0), COUNT(*)::int INTO v_fts, v_fts_events FROM fts_violations WHERE organization_id = v_org_id;
  SELECT COALESCE(SUM(calculate_draft_miss_sampling_penalty(days_late)), 0), COUNT(*)::int INTO v_gap_estimate, v_gap_missed
  FROM sampling_gap_records WHERE organization_id = v_org_id AND gap_kind = 'missed' AND review_status NOT IN ('resolved', 'force_majeure');
  SELECT COALESCE(SUM(accrued_penalty), 0), COUNT(*)::int INTO v_obligations, v_obligations_count
  FROM consent_decree_obligations WHERE status IN ('active', 'overdue') AND accrued_penalty > 0;
  SELECT COALESCE(SUM(COALESCE(actual_penalty, estimated_penalty, 0)), 0), COUNT(*)::int INTO v_violations, v_violations_count
  FROM compliance_violations WHERE organization_id = v_org_id AND status NOT IN ('closed', 'resolved');
  UPDATE penalty_exposure_lines SET valid_to = v_snapshot, updated_at = v_snapshot
  WHERE organization_id = v_org_id AND valid_to IS NULL AND snapshot_at < v_snapshot;
  INSERT INTO penalty_exposure_lines (organization_id, source_key, label, amount, event_count, citation, verification_status, confidence, snapshot_at)
  VALUES
    (v_org_id, 'fts_uploaded', 'Failure-to-Sample (uploaded FTS)', v_fts, v_fts_events, 'Consent Decree ¶49 — failure-to-sample reporting (uploaded FTS records)', v_verification_status, 'uploaded', v_snapshot),
    (v_org_id, 'sampling_gaps', 'Calendar gaps (draft estimate)', v_gap_estimate, v_gap_missed, 'Consent Decree ¶49 Category I/II — draft miss-sampling estimate (internal model)', 'draft', 'draft_estimate', v_snapshot),
    (v_org_id, 'cd_obligations', 'Consent Decree obligations (accrual)', v_obligations, v_obligations_count, 'Case 7:16-cv-00462-GEC — stipulated penalty accrual on active CD obligations', v_verification_status, 'calculated', v_snapshot),
    (v_org_id, 'compliance_violations', 'Compliance violations (est./actual)', v_violations, v_violations_count, 'Organization compliance_violations — estimated/actual penalty exposure', v_verification_status, 'mixed', v_snapshot)
  ON CONFLICT (organization_id, source_key, snapshot_at) DO UPDATE SET amount = EXCLUDED.amount, event_count = EXCLUDED.event_count, verification_status = EXCLUDED.verification_status, updated_at = v_snapshot;
END;
$function$;

-- ---------------------------------------------------------------------------
-- get_sampling_obligation_ledger — read guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sampling_obligation_ledger(p_organization_id uuid DEFAULT NULL::uuid, p_status_filter text DEFAULT NULL::text, p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid := resolve_scoped_org_id(p_organization_id);
  v_schedules integer := 0;
  v_outfalls integer := 0;
  v_parameters integer := 0;
  v_matrix_rows integer := 0;
  v_total integer := 0;
  v_fulfilled integer := 0;
  v_excused integer := 0;
  v_missed integer := 0;
  v_at_risk integer := 0;
  v_upcoming integer := 0;
  v_rows jsonb;
BEGIN
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Organization context required');
  END IF;

  IF p_status_filter IS NOT NULL
     AND p_status_filter NOT IN ('fulfilled', 'excused', 'missed', 'at_risk', 'upcoming') THEN
    RETURN jsonb_build_object('error', 'Invalid status filter');
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE is_active),
    COUNT(DISTINCT outfall_id) FILTER (WHERE is_active),
    COUNT(DISTINCT parameter_id) FILTER (WHERE is_active),
    COUNT(*) FILTER (WHERE is_active AND source <> 'manual')
  INTO v_schedules, v_outfalls, v_parameters, v_matrix_rows
  FROM sampling_schedules
  WHERE organization_id = v_org_id;

  WITH classified AS (
    SELECT
      sc.id AS calendar_id,
      sc.scheduled_date,
      COALESCE(sc.window_end, sc.scheduled_date) AS effective_due,
      sc.status AS calendar_status,
      sc.dispatch_status,
      o.outfall_number,
      p.short_name AS parameter_short_name,
      np.permit_number,
      ss.source AS schedule_source,
      ss.frequency_code,
      CASE
        WHEN sampling_calendar_has_lab_result(sc.id) THEN 'fulfilled'
        WHEN sampling_calendar_is_documented_excuse(sc.id) THEN 'excused'
        WHEN COALESCE(sc.window_end, sc.scheduled_date) < CURRENT_DATE THEN 'missed'
        WHEN COALESCE(sc.window_end, sc.scheduled_date) <= CURRENT_DATE + 2 THEN 'at_risk'
        ELSE 'upcoming'
      END AS obligation_status,
      GREATEST(0, CURRENT_DATE - COALESCE(sc.window_end, sc.scheduled_date)) AS days_late
    FROM sampling_calendar sc
    JOIN sampling_schedules ss ON ss.id = sc.schedule_id
    JOIN outfalls o ON o.id = sc.outfall_id
    JOIN parameters p ON p.id = sc.parameter_id
    LEFT JOIN npdes_permits np ON np.id = ss.permit_id
    WHERE sc.organization_id = v_org_id
  ),
  filtered AS (
    SELECT *
    FROM classified c
    WHERE p_status_filter IS NULL OR c.obligation_status = p_status_filter
  )
  SELECT
    (SELECT COUNT(*) FROM classified),
    (SELECT COUNT(*) FROM classified WHERE obligation_status = 'fulfilled'),
    (SELECT COUNT(*) FROM classified WHERE obligation_status = 'excused'),
    (SELECT COUNT(*) FROM classified WHERE obligation_status = 'missed'),
    (SELECT COUNT(*) FROM classified WHERE obligation_status = 'at_risk'),
    (SELECT COUNT(*) FROM classified WHERE obligation_status = 'upcoming'),
    COALESCE(
      (
        SELECT jsonb_agg(row_to_json(f)::jsonb ORDER BY f.effective_due DESC, f.outfall_number, f.parameter_short_name)
        FROM (
          SELECT *
          FROM filtered
          ORDER BY effective_due DESC, outfall_number, parameter_short_name
          LIMIT GREATEST(1, LEAST(p_limit, 2000))
        ) f
      ),
      '[]'::jsonb
    )
  INTO v_total, v_fulfilled, v_excused, v_missed, v_at_risk, v_upcoming, v_rows;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'computed_at', now(),
    'disclaimer',
      'DRAFT — partial obligation calendar; fills incrementally as Sampling Matrix and Upload Dashboard populate permits/outfalls',
    'coverage', jsonb_build_object(
      'active_schedules', v_schedules,
      'distinct_outfalls', v_outfalls,
      'distinct_parameters', v_parameters,
      'calendar_events', v_total,
      'matrix_rows', v_matrix_rows,
      'matrix_loaded', v_matrix_rows > 0
    ),
    'status_counts', jsonb_build_object(
      'fulfilled', v_fulfilled,
      'excused', v_excused,
      'missed', v_missed,
      'at_risk', v_at_risk,
      'upcoming', v_upcoming
    ),
    'rows', v_rows
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- detect_sampling_calendar_gaps — write guard (opens gaps + work orders)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_sampling_calendar_gaps(p_organization_id uuid DEFAULT NULL::uuid, p_as_of date DEFAULT CURRENT_DATE, p_at_risk_horizon_days integer DEFAULT 2, p_source text DEFAULT 'scheduled'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid := resolve_scoped_org_id(p_organization_id);
  v_run_id uuid; v_scanned integer := 0; v_opened integer := 0; v_updated integer := 0; v_resolved integer := 0;
  rec RECORD; v_effective_due date; v_days_late integer; v_days_until integer;
  v_gap_kind text; v_severity text; v_existing_id uuid;
BEGIN
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization context is required for gap detection'; END IF;
  IF p_source NOT IN ('scheduled', 'manual') THEN RAISE EXCEPTION 'Invalid detection source: %', p_source; END IF;
  INSERT INTO sampling_gap_detection_runs (organization_id, as_of_date, source, status)
  VALUES (v_org_id, p_as_of, p_source, 'running') RETURNING id INTO v_run_id;
  INSERT INTO audit_log (organization_id, action, module, table_name, record_id, new_values, description)
  VALUES (v_org_id, 'sampling_gap_detection_started', 'environmental_compliance', 'sampling_gap_detection_runs', v_run_id,
    jsonb_build_object('as_of_date', p_as_of, 'source', p_source, 'at_risk_horizon_days', p_at_risk_horizon_days),
    'Calendar gap detection run started');
  PERFORM refresh_sampling_calendar_statuses(v_org_id, p_as_of);
  WITH resolved AS (
    UPDATE sampling_gap_records sgr SET review_status = 'resolved', resolved_at = now(), valid_to = now(), updated_at = now(),
      review_notes = COALESCE(review_notes, 'Auto-resolved: lab result or documented field outcome detected')
    WHERE sgr.organization_id = v_org_id AND sgr.review_status <> 'resolved'
      AND (sampling_calendar_has_lab_result(sgr.calendar_id) OR sampling_calendar_is_documented_excuse(sgr.calendar_id))
    RETURNING sgr.work_order_id
  ), close_work_orders AS (
    UPDATE work_orders wo SET status = 'completed', completed_at = now(),
      notes = COALESCE(wo.notes, '') || ' Auto-closed: gap resolved by lab result or documented excuse.'
    FROM resolved r WHERE wo.id = r.work_order_id AND wo.status IN ('open', 'assigned', 'in_progress') RETURNING 1
  ) SELECT COUNT(*) INTO v_resolved FROM resolved;
  FOR rec IN
    SELECT sc.id AS calendar_id, sc.outfall_id, sc.parameter_id, sc.scheduled_date,
      COALESCE(sc.window_end, sc.scheduled_date) AS effective_due, sc.dispatch_status, sc.status AS calendar_status,
      sc.skip_reason, fv.outcome AS field_visit_outcome, fv.visit_status AS field_visit_status
    FROM sampling_calendar sc LEFT JOIN field_visits fv ON fv.id = sc.current_field_visit_id
    WHERE sc.organization_id = v_org_id AND NOT sampling_calendar_has_lab_result(sc.id)
      AND NOT sampling_calendar_is_documented_excuse(sc.id) AND sc.status NOT IN ('cancelled')
  LOOP
    v_scanned := v_scanned + 1; v_effective_due := rec.effective_due;
    v_days_late := GREATEST(0, p_as_of - v_effective_due); v_days_until := GREATEST(0, v_effective_due - p_as_of);
    IF v_effective_due < p_as_of THEN v_gap_kind := 'missed';
    ELSIF v_effective_due <= p_as_of + p_at_risk_horizon_days THEN v_gap_kind := 'at_risk'; ELSE CONTINUE; END IF;
    v_severity := sampling_calendar_gap_severity(v_gap_kind, v_days_late, v_days_until);
    SELECT id INTO v_existing_id FROM sampling_gap_records WHERE calendar_id = rec.calendar_id AND review_status <> 'resolved' LIMIT 1;
    IF v_existing_id IS NULL THEN
      PERFORM open_sampling_gap_with_work_order(v_org_id, v_run_id, rec.calendar_id, v_gap_kind, v_severity,
        rec.scheduled_date, rec.effective_due, v_days_late, rec.dispatch_status, rec.calendar_status,
        rec.field_visit_outcome, rec.field_visit_status, rec.skip_reason, rec.outfall_id, rec.parameter_id);
      v_opened := v_opened + 1;
    ELSE
      UPDATE sampling_gap_records SET detection_run_id = v_run_id, gap_kind = v_gap_kind, severity = v_severity,
        days_late = v_days_late, dispatch_status = rec.dispatch_status, calendar_status = rec.calendar_status,
        field_visit_outcome = rec.field_visit_outcome, field_visit_status = rec.field_visit_status,
        skip_reason = rec.skip_reason, window_end = rec.effective_due, last_detected_at = now(), updated_at = now()
      WHERE id = v_existing_id; v_updated := v_updated + 1;
    END IF;
  END LOOP;
  UPDATE sampling_gap_detection_runs SET finished_at = now(), calendars_scanned = v_scanned, gaps_opened = v_opened,
    gaps_updated = v_updated, gaps_resolved = v_resolved, status = 'completed',
    metadata = jsonb_build_object('at_risk_horizon_days', p_at_risk_horizon_days) WHERE id = v_run_id;
  INSERT INTO audit_log (organization_id, action, module, table_name, record_id, new_values, description)
  VALUES (v_org_id, 'sampling_gap_detection_completed', 'environmental_compliance', 'sampling_gap_detection_runs', v_run_id,
    jsonb_build_object('calendars_scanned', v_scanned, 'gaps_opened', v_opened, 'gaps_updated', v_updated, 'gaps_resolved', v_resolved),
    'Calendar gap detection run completed');
  RETURN jsonb_build_object('run_id', v_run_id, 'organization_id', v_org_id, 'calendars_scanned', v_scanned,
    'gaps_opened', v_opened, 'gaps_updated', v_updated, 'gaps_resolved', v_resolved);
EXCEPTION WHEN OTHERS THEN
  UPDATE sampling_gap_detection_runs SET finished_at = now(), status = 'failed', error_message = SQLERRM WHERE id = v_run_id;
  INSERT INTO audit_log (organization_id, action, module, table_name, record_id, new_values, description)
  VALUES (v_org_id, 'sampling_gap_detection_failed', 'environmental_compliance', 'sampling_gap_detection_runs', v_run_id,
    jsonb_build_object('error', SQLERRM), 'Calendar gap detection run failed'); RAISE;
END;
$function$;

-- ---------------------------------------------------------------------------
-- open_sampling_gap_with_work_order — assert org access at the top.
-- Reachable via detect_sampling_calendar_gaps (same org) or service role; a
-- direct authenticated call for a foreign org now raises.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_sampling_gap_with_work_order(p_organization_id uuid, p_detection_run_id uuid, p_calendar_id uuid, p_gap_kind text, p_severity text, p_scheduled_date date, p_window_end date, p_days_late integer, p_dispatch_status text, p_calendar_status text, p_field_visit_outcome text, p_field_visit_status text, p_skip_reason text, p_outfall_id uuid, p_parameter_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gap_id uuid;
  v_wo_id uuid;
  v_priority text;
  v_title text;
  v_outfall_number text;
  v_parameter_short_name text;
BEGIN
  PERFORM resolve_scoped_org_id(p_organization_id);

  SELECT o.outfall_number, p.short_name
  INTO v_outfall_number, v_parameter_short_name
  FROM outfalls o, parameters p
  WHERE o.id = p_outfall_id AND p.id = p_parameter_id;

  v_priority := CASE p_severity
    WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high'
    WHEN 'medium' THEN 'medium' ELSE 'low' END;

  v_title := format('Sampling gap: %s %s (%s, %s days late)',
    COALESCE(v_outfall_number, 'outfall'), COALESCE(v_parameter_short_name, 'parameter'),
    p_gap_kind, p_days_late);

  INSERT INTO work_orders (organization_id, source_type, outfall_id, title, description, priority, status, due_date)
  VALUES (p_organization_id, 'sampling_gap', p_outfall_id, v_title,
    format('Auto-opened from calendar-gap detector. Scheduled %s.', p_scheduled_date),
    v_priority, 'open', CURRENT_DATE + 7)
  RETURNING id INTO v_wo_id;

  INSERT INTO work_order_events (work_order_id, event_type, new_value, notes)
  VALUES (v_wo_id, 'created', 'open', 'Opened by sampling calendar gap detector');

  INSERT INTO sampling_gap_records (
    organization_id, calendar_id, detection_run_id, gap_kind, severity,
    scheduled_date, window_end, days_late, dispatch_status, calendar_status,
    field_visit_outcome, field_visit_status, skip_reason, outfall_id, parameter_id,
    work_order_id, valid_from, transaction_time
  ) VALUES (
    p_organization_id, p_calendar_id, p_detection_run_id, p_gap_kind, p_severity,
    p_scheduled_date, p_window_end, p_days_late, p_dispatch_status, p_calendar_status,
    p_field_visit_outcome, p_field_visit_status, p_skip_reason, p_outfall_id, p_parameter_id,
    v_wo_id, now(), now()
  ) RETURNING id INTO v_gap_id;

  UPDATE work_orders SET source_id = v_gap_id WHERE id = v_wo_id;
  RETURN v_gap_id;
END;
$function$;
