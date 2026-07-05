-- Lane C QW1: readiness states + self-generating nightly calendar window.
--
-- The detector is useful before the Sampling Matrix lands, but it must not
-- confuse "no open gaps" with "no schedules/calendar configured." This follow-on
-- keeps the existing detector real while making the missing-data state explicit.

-- ---------------------------------------------------------------------------
-- 1. Generate the active calendar window before each detector scan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_sampling_gap_calendar_window(
  p_organization_id uuid,
  p_as_of date DEFAULT CURRENT_DATE,
  p_past_months integer DEFAULT 1,
  p_future_months integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := resolve_scoped_org_id(p_organization_id);
  v_active_schedules integer := 0;
  v_start_offset integer := -1 * GREATEST(COALESCE(p_past_months, 0), 0);
  v_end_offset integer := GREATEST(COALESCE(p_future_months, 0), 0);
  v_offset integer;
  v_month date;
  v_result jsonb;
  v_generated integer := 0;
  v_skipped integer := 0;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required for calendar window generation';
  END IF;

  SELECT COUNT(*)::int
  INTO v_active_schedules
  FROM public.sampling_schedules
  WHERE organization_id = v_org_id
    AND is_active = true;

  IF v_active_schedules = 0 THEN
    RETURN jsonb_build_object(
      'state', 'not_configured',
      'active_schedules', 0,
      'calendar_rows_generated', 0,
      'skipped_schedule_count', 0
    );
  END IF;

  FOR v_offset IN v_start_offset..v_end_offset LOOP
    v_month := (date_trunc('month', p_as_of)::date + (v_offset * interval '1 month'))::date;
    v_result := public.generate_sampling_calendar(v_month, v_org_id);
    v_generated := v_generated + COALESCE((v_result ->> 'generated_count')::integer, 0);
    v_skipped := v_skipped + COALESCE((v_result ->> 'skipped_schedule_count')::integer, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'state', 'generated',
    'active_schedules', v_active_schedules,
    'months_generated', v_end_offset - v_start_offset + 1,
    'calendar_rows_generated', v_generated,
    'skipped_schedule_count', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_sampling_gap_calendar_window(uuid, date, integer, integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_sampling_gap_calendar_window(uuid, date, integer, integer)
TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Readiness RPC for draft / empty / not-configured UI states
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sampling_gap_detection_readiness(
  p_organization_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := resolve_scoped_org_id(p_organization_id);
  v_active_schedules integer := 0;
  v_matrix_rows integer := 0;
  v_manual_schedules integer := 0;
  v_calendar_events integer := 0;
  v_open_gaps integer := 0;
  v_missed integer := 0;
  v_at_risk integer := 0;
  v_latest_run jsonb := NULL;
  v_state text;
BEGIN
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'state', 'not_configured',
      'error', 'Organization context required',
      'disclaimer', 'DRAFT - Sampling Matrix dependent detector'
    );
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE is_active)::int,
    COUNT(*) FILTER (WHERE is_active AND source = 'matrix_upload')::int,
    COUNT(*) FILTER (WHERE is_active AND source <> 'matrix_upload')::int
  INTO v_active_schedules, v_matrix_rows, v_manual_schedules
  FROM public.sampling_schedules
  WHERE organization_id = v_org_id;

  SELECT COUNT(*)::int
  INTO v_calendar_events
  FROM public.sampling_calendar
  WHERE organization_id = v_org_id;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE gap_kind = 'missed')::int,
    COUNT(*) FILTER (WHERE gap_kind = 'at_risk')::int
  INTO v_open_gaps, v_missed, v_at_risk
  FROM public.sampling_gap_records
  WHERE organization_id = v_org_id
    AND review_status <> 'resolved';

  SELECT jsonb_build_object(
    'id', r.id,
    'started_at', r.started_at,
    'finished_at', r.finished_at,
    'status', r.status,
    'source', r.source,
    'calendars_scanned', r.calendars_scanned,
    'gaps_opened', r.gaps_opened,
    'gaps_updated', r.gaps_updated,
    'gaps_resolved', r.gaps_resolved,
    'error_message', r.error_message
  )
  INTO v_latest_run
  FROM public.sampling_gap_detection_runs r
  WHERE r.organization_id = v_org_id
  ORDER BY r.started_at DESC
  LIMIT 1;

  v_state := CASE
    WHEN v_active_schedules = 0 AND v_calendar_events = 0 THEN 'not_configured'
    WHEN v_calendar_events = 0 THEN 'empty'
    WHEN v_matrix_rows = 0 THEN 'draft'
    ELSE 'configured'
  END;

  RETURN jsonb_build_object(
    'state', v_state,
    'organization_id', v_org_id,
    'active_schedules', v_active_schedules,
    'matrix_rows', v_matrix_rows,
    'manual_schedules', v_manual_schedules,
    'calendar_events', v_calendar_events,
    'matrix_loaded', v_matrix_rows > 0,
    'open_gaps', v_open_gaps,
    'missed', v_missed,
    'at_risk', v_at_risk,
    'latest_run', v_latest_run,
    'disclaimer', 'DRAFT - severity for human review; Sampling Matrix completeness not verified'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_sampling_gap_detection_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sampling_gap_detection_readiness(uuid)
TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Detector override: generate calendar first and leave work-order events on close
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_sampling_calendar_gaps(
  p_organization_id uuid DEFAULT NULL::uuid,
  p_as_of date DEFAULT CURRENT_DATE,
  p_at_risk_horizon_days integer DEFAULT 2,
  p_source text DEFAULT 'scheduled'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := resolve_scoped_org_id(p_organization_id);
  v_run_id uuid;
  v_scanned integer := 0;
  v_opened integer := 0;
  v_updated integer := 0;
  v_resolved integer := 0;
  v_calendar_generation jsonb := '{}'::jsonb;
  v_readiness jsonb := '{}'::jsonb;
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

  INSERT INTO public.sampling_gap_detection_runs (organization_id, as_of_date, source, status)
  VALUES (v_org_id, p_as_of, p_source, 'running')
  RETURNING id INTO v_run_id;

  INSERT INTO public.audit_log (
    organization_id,
    action,
    module,
    table_name,
    record_id,
    new_values,
    description
  ) VALUES (
    v_org_id,
    'sampling_gap_detection_started',
    'environmental_compliance',
    'sampling_gap_detection_runs',
    v_run_id,
    jsonb_build_object(
      'as_of_date', p_as_of,
      'source', p_source,
      'at_risk_horizon_days', p_at_risk_horizon_days
    ),
    'Calendar gap detection run started'
  );

  v_calendar_generation := public.ensure_sampling_gap_calendar_window(v_org_id, p_as_of, 1, 1);

  PERFORM public.refresh_sampling_calendar_statuses(v_org_id, p_as_of);

  WITH resolved AS (
    UPDATE public.sampling_gap_records sgr
    SET review_status = 'resolved',
        resolved_at = now(),
        valid_to = now(),
        updated_at = now(),
        review_notes = COALESCE(
          review_notes,
          'Auto-resolved: lab result or documented field outcome detected'
        )
    WHERE sgr.organization_id = v_org_id
      AND sgr.review_status <> 'resolved'
      AND (
        public.sampling_calendar_has_lab_result(sgr.calendar_id)
        OR public.sampling_calendar_is_documented_excuse(sgr.calendar_id)
      )
    RETURNING sgr.id, sgr.work_order_id
  ),
  closed AS (
    UPDATE public.work_orders wo
    SET status = 'completed',
        completed_at = now(),
        notes = trim(COALESCE(wo.notes, '') || ' Auto-closed: gap resolved by lab result or documented excuse.')
    FROM resolved r
    WHERE wo.id = r.work_order_id
      AND wo.status IN ('open', 'assigned', 'in_progress')
    RETURNING wo.id
  ),
  close_events AS (
    INSERT INTO public.work_order_events (work_order_id, event_type, old_value, new_value, notes)
    SELECT
      c.id,
      'completed',
      'open/assigned/in_progress',
      'completed',
      'Auto-closed by sampling calendar gap detector'
    FROM closed c
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_resolved FROM resolved;

  FOR rec IN
    SELECT
      sc.id AS calendar_id,
      sc.outfall_id,
      sc.parameter_id,
      sc.scheduled_date,
      COALESCE(sc.window_end, sc.scheduled_date) AS effective_due,
      sc.dispatch_status,
      sc.status AS calendar_status,
      sc.skip_reason,
      fv.outcome AS field_visit_outcome,
      fv.visit_status AS field_visit_status
    FROM public.sampling_calendar sc
    LEFT JOIN public.field_visits fv ON fv.id = sc.current_field_visit_id
    WHERE sc.organization_id = v_org_id
      AND NOT public.sampling_calendar_has_lab_result(sc.id)
      AND NOT public.sampling_calendar_is_documented_excuse(sc.id)
      AND sc.status NOT IN ('cancelled')
  LOOP
    v_scanned := v_scanned + 1;
    v_effective_due := rec.effective_due;
    v_days_late := GREATEST(0, p_as_of - v_effective_due);
    v_days_until := GREATEST(0, v_effective_due - p_as_of);

    IF v_effective_due < p_as_of THEN
      v_gap_kind := 'missed';
    ELSIF v_effective_due <= p_as_of + p_at_risk_horizon_days THEN
      v_gap_kind := 'at_risk';
    ELSE
      CONTINUE;
    END IF;

    v_severity := public.sampling_calendar_gap_severity(v_gap_kind, v_days_late, v_days_until);

    SELECT id INTO v_existing_id
    FROM public.sampling_gap_records
    WHERE calendar_id = rec.calendar_id
      AND review_status <> 'resolved'
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      PERFORM public.open_sampling_gap_with_work_order(
        v_org_id,
        v_run_id,
        rec.calendar_id,
        v_gap_kind,
        v_severity,
        rec.scheduled_date,
        rec.effective_due,
        v_days_late,
        rec.dispatch_status,
        rec.calendar_status,
        rec.field_visit_outcome,
        rec.field_visit_status,
        rec.skip_reason,
        rec.outfall_id,
        rec.parameter_id
      );
      v_opened := v_opened + 1;
    ELSE
      UPDATE public.sampling_gap_records
      SET detection_run_id = v_run_id,
          gap_kind = v_gap_kind,
          severity = v_severity,
          days_late = v_days_late,
          dispatch_status = rec.dispatch_status,
          calendar_status = rec.calendar_status,
          field_visit_outcome = rec.field_visit_outcome,
          field_visit_status = rec.field_visit_status,
          skip_reason = rec.skip_reason,
          window_end = rec.effective_due,
          last_detected_at = now(),
          updated_at = now()
      WHERE id = v_existing_id;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  v_readiness := public.get_sampling_gap_detection_readiness(v_org_id);

  UPDATE public.sampling_gap_detection_runs
  SET finished_at = now(),
      calendars_scanned = v_scanned,
      gaps_opened = v_opened,
      gaps_updated = v_updated,
      gaps_resolved = v_resolved,
      status = 'completed',
      metadata = jsonb_build_object(
        'at_risk_horizon_days', p_at_risk_horizon_days,
        'calendar_generation', v_calendar_generation,
        'readiness_state', v_readiness ->> 'state'
      )
  WHERE id = v_run_id;

  INSERT INTO public.audit_log (
    organization_id,
    action,
    module,
    table_name,
    record_id,
    new_values,
    description
  ) VALUES (
    v_org_id,
    'sampling_gap_detection_completed',
    'environmental_compliance',
    'sampling_gap_detection_runs',
    v_run_id,
    jsonb_build_object(
      'calendars_scanned', v_scanned,
      'gaps_opened', v_opened,
      'gaps_updated', v_updated,
      'gaps_resolved', v_resolved,
      'calendar_generation', v_calendar_generation,
      'readiness_state', v_readiness ->> 'state'
    ),
    'Calendar gap detection run completed'
  );

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'organization_id', v_org_id,
    'calendars_scanned', v_scanned,
    'gaps_opened', v_opened,
    'gaps_updated', v_updated,
    'gaps_resolved', v_resolved,
    'calendar_generation', v_calendar_generation,
    'readiness_state', v_readiness ->> 'state'
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE public.sampling_gap_detection_runs
  SET finished_at = now(),
      status = 'failed',
      error_message = SQLERRM
  WHERE id = v_run_id;

  INSERT INTO public.audit_log (
    organization_id,
    action,
    module,
    table_name,
    record_id,
    new_values,
    description
  ) VALUES (
    v_org_id,
    'sampling_gap_detection_failed',
    'environmental_compliance',
    'sampling_gap_detection_runs',
    v_run_id,
    jsonb_build_object('error', SQLERRM),
    'Calendar gap detection run failed'
  );

  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.detect_sampling_calendar_gaps(uuid, date, integer, text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_sampling_calendar_gaps(uuid, date, integer, text)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.open_sampling_gap_with_work_order(
  uuid, uuid, uuid, text, text, date, date, integer, text, text, text, text, text, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_sampling_gap_with_work_order(
  uuid, uuid, uuid, text, text, date, date, integer, text, text, text, text, text, uuid, uuid
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.open_sampling_gap_with_work_order(
  uuid, uuid, uuid, text, text, date, date, integer, text, text, text, text, text, uuid, uuid
) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Triage override: manager-only, audit logged, and closes coupled work order
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_sampling_gap_review_status(
  p_gap_id uuid,
  p_review_status text,
  p_review_notes text DEFAULT NULL
)
RETURNS public.sampling_gap_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.sampling_gap_records%ROWTYPE;
  v_closed_work_order_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.can_manage_sampling_records() THEN
    RAISE EXCEPTION 'Insufficient permissions to update sampling gap triage status';
  END IF;

  IF p_review_status NOT IN ('pending', 'acknowledged', 'disputed', 'force_majeure', 'resolved') THEN
    RAISE EXCEPTION 'Invalid review status: %', p_review_status;
  END IF;

  UPDATE public.sampling_gap_records
  SET review_status = p_review_status,
      review_notes = COALESCE(p_review_notes, review_notes),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      resolved_at = CASE WHEN p_review_status = 'resolved' THEN now() ELSE resolved_at END,
      valid_to = CASE WHEN p_review_status = 'resolved' THEN now() ELSE valid_to END,
      transaction_time = now(),
      updated_at = now()
  WHERE id = p_gap_id
    AND organization_id = public.get_user_org_id()
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Gap record not found or not accessible';
  END IF;

  IF p_review_status = 'resolved' AND v_row.work_order_id IS NOT NULL THEN
    UPDATE public.work_orders
    SET status = 'completed',
        completed_by = COALESCE(completed_by, auth.uid()),
        completed_at = COALESCE(completed_at, now()),
        notes = trim(COALESCE(notes, '') || ' Closed from Missed / At-Risk sampling triage.')
    WHERE id = v_row.work_order_id
      AND organization_id = v_row.organization_id
      AND status IN ('open', 'assigned', 'in_progress')
    RETURNING id INTO v_closed_work_order_id;

    IF v_closed_work_order_id IS NOT NULL THEN
      INSERT INTO public.work_order_events (
        work_order_id,
        event_type,
        old_value,
        new_value,
        notes,
        created_by
      ) VALUES (
        v_closed_work_order_id,
        'completed',
        'open/assigned/in_progress',
        'completed',
        'Closed from Missed / At-Risk sampling triage',
        auth.uid()
      );
    END IF;
  END IF;

  INSERT INTO public.audit_log (
    user_id,
    organization_id,
    action,
    module,
    table_name,
    record_id,
    new_values,
    description
  ) VALUES (
    auth.uid(),
    v_row.organization_id,
    'sampling_gap_review_updated',
    'environmental_compliance',
    'sampling_gap_records',
    v_row.id,
    jsonb_build_object(
      'review_status', p_review_status,
      'gap_kind', v_row.gap_kind,
      'calendar_id', v_row.calendar_id,
      'work_order_id', v_row.work_order_id
    ),
    'Sampling gap triage updated'
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_sampling_gap_review_status(uuid, text, text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_sampling_gap_review_status(uuid, text, text)
TO authenticated;

COMMENT ON FUNCTION public.get_sampling_gap_detection_readiness(uuid) IS
  'Lane C QW1 readiness envelope for configured/draft/empty/not-configured Sampling Matrix states.';
