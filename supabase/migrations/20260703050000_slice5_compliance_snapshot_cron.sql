-- Slice 5 — Compliance dashboard snapshot: CMS DMR columns + daily cron (job_runs)

CREATE OR REPLACE FUNCTION public.generate_compliance_snapshot(
  p_org_id uuid,
  p_snapshot_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id uuid;
  v_total_permits integer;
  v_active_permits integer;
  v_total_outfalls integer;
  v_active_outfalls integer;
  v_sampling_due integer;
  v_sampling_completed integer;
  v_sampling_pct numeric;
  v_total_exceedances integer;
  v_open_exceedances integer;
  v_exceedance_rate numeric;
  v_total_violations integer;
  v_open_violations integer;
  v_critical_violations integer;
  v_total_cas integer;
  v_open_cas integer;
  v_overdue_cas integer;
  v_avg_ca_days numeric;
  v_total_wos integer;
  v_open_wos integer;
  v_overdue_wos integer;
  v_dmr_due integer;
  v_dmr_completed integer;
  v_dmr_rate numeric;
  v_total_incidents integer;
  v_open_incidents integer;
  v_total_penalties numeric;
  v_compliance_score numeric;
  v_state_breakdown jsonb;
  v_cms_dmr boolean;
BEGIN
  -- Authenticated UI users must match org; cron/postgres paths have NULL org (Slice 5)
  IF get_user_org_id() IS NOT NULL AND get_user_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dmr_submissions'
      AND column_name = 'reporting_period_start'
  ) INTO v_cms_dmr;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'active')
  INTO v_total_permits, v_active_permits
  FROM public.npdes_permits
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, site_id, id, NULL);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE o.is_active = true)
  INTO v_total_outfalls, v_active_outfalls
  FROM public.outfalls o
  JOIN public.npdes_permits p ON o.permit_id = p.id
  WHERE p.organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, p.site_id, p.id, o.id);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE se.status = 'completed')
  INTO v_sampling_due, v_sampling_completed
  FROM public.sampling_events se
  JOIN public.outfalls o ON se.outfall_id = o.id
  JOIN public.npdes_permits p ON o.permit_id = p.id
  WHERE p.organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, p.site_id, p.id, o.id)
    AND se.scheduled_date >= p_snapshot_date - INTERVAL '30 days'
    AND se.scheduled_date <= p_snapshot_date;

  v_sampling_pct := CASE WHEN v_sampling_due > 0
    THEN ROUND((v_sampling_completed::numeric / v_sampling_due) * 100, 2)
    ELSE 100 END;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE e.status = 'open')
  INTO v_total_exceedances, v_open_exceedances
  FROM public.exceedances e
  JOIN public.outfalls o ON e.outfall_id = o.id
  JOIN public.npdes_permits p ON o.permit_id = p.id
  WHERE e.organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, p.site_id, p.id, o.id);

  v_exceedance_rate := CASE WHEN v_sampling_completed > 0
    THEN ROUND((v_total_exceedances::numeric / v_sampling_completed) * 100, 2)
    ELSE 0 END;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('open', 'under_investigation')),
    COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('resolved', 'closed'))
  INTO v_total_violations, v_open_violations, v_critical_violations
  FROM public.compliance_violations
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, site_id, NULL, NULL);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status NOT IN ('closed', 'verified', 'cancelled')),
    COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('closed', 'verified', 'cancelled')),
    ROUND(AVG(
      CASE WHEN closed_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400
      END
    )::numeric, 1)
  INTO v_total_cas, v_open_cas, v_overdue_cas, v_avg_ca_days
  FROM public.corrective_actions
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, site_id, npdes_permit_id, NULL);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status NOT IN ('completed', 'verified', 'cancelled')),
    COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('completed', 'verified', 'cancelled'))
  INTO v_total_wos, v_open_wos, v_overdue_wos
  FROM public.work_orders
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, site_id, permit_id, outfall_id);

  IF v_cms_dmr THEN
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE ds.status IN ('submitted', 'accepted'))
    INTO v_dmr_due, v_dmr_completed
    FROM public.dmr_submissions ds
    JOIN public.npdes_permits p ON p.id = ds.permit_id
    WHERE p.organization_id = p_org_id
      AND public.in_live_program_scope(p_org_id, p.site_id, ds.permit_id, NULL)
      AND ds.reporting_period_start >= date_trunc('quarter', p_snapshot_date::timestamp)::date;
  ELSE
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE ds.status IN ('submitted', 'accepted'))
    INTO v_dmr_due, v_dmr_completed
    FROM public.dmr_submissions ds
    WHERE ds.organization_id = p_org_id
      AND ds.period_start >= date_trunc('quarter', p_snapshot_date::timestamp)::date;
  END IF;

  v_dmr_rate := CASE WHEN v_dmr_due > 0
    THEN ROUND((v_dmr_completed::numeric / v_dmr_due) * 100, 2)
    ELSE 100 END;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('open', 'investigating'))
  INTO v_total_incidents, v_open_incidents
  FROM public.incidents
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, NULL, permit_id, outfall_id);

  SELECT COALESCE(SUM(COALESCE(actual_penalty, estimated_penalty, 0)), 0)
  INTO v_total_penalties
  FROM public.compliance_violations
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, site_id, NULL, NULL);

  v_compliance_score := ROUND(
    (v_sampling_pct * 0.40) +
    ((100 - LEAST(v_exceedance_rate, 100)) * 0.25) +
    (CASE WHEN v_total_cas > 0
      THEN ((v_total_cas - v_overdue_cas)::numeric / v_total_cas) * 100
      ELSE 100 END * 0.20) +
    (v_dmr_rate * 0.15),
    2
  );

  SELECT jsonb_agg(jsonb_build_object(
    'state', sub.state_code,
    'permits', sub.permit_count,
    'outfalls', sub.outfall_count,
    'exceedances', sub.exc_count,
    'violations', sub.viol_count
  ))
  INTO v_state_breakdown
  FROM (
    SELECT
      s.state_code,
      COUNT(DISTINCT p.id) AS permit_count,
      COUNT(DISTINCT o.id) AS outfall_count,
      COUNT(DISTINCT e.id) AS exc_count,
      COUNT(DISTINCT cv.id) AS viol_count
    FROM public.sites s
    LEFT JOIN public.npdes_permits p
      ON p.site_id = s.id
      AND p.organization_id = p_org_id
      AND public.in_live_program_scope(p_org_id, s.id, p.id, NULL)
    LEFT JOIN public.outfalls o
      ON o.permit_id = p.id
      AND public.in_live_program_scope(p_org_id, s.id, p.id, o.id)
    LEFT JOIN public.exceedances e
      ON e.outfall_id = o.id
      AND e.organization_id = p_org_id
    LEFT JOIN public.compliance_violations cv
      ON cv.site_id = s.id
      AND cv.organization_id = p_org_id
      AND public.in_live_program_scope(p_org_id, s.id, NULL, NULL)
    WHERE s.organization_id = p_org_id
      AND public.in_live_program_scope(p_org_id, s.id, NULL, NULL)
    GROUP BY s.state_code
  ) sub;

  INSERT INTO public.compliance_snapshots (
    organization_id, snapshot_date, snapshot_type,
    total_permits, active_permits, total_outfalls, active_outfalls,
    sampling_events_due, sampling_events_completed, sampling_compliance_pct,
    total_exceedances, open_exceedances, exceedance_rate_pct,
    total_violations, open_violations, critical_violations,
    total_corrective_actions, open_corrective_actions, overdue_corrective_actions, avg_ca_closure_days,
    total_work_orders, open_work_orders, overdue_work_orders,
    dmr_submissions_due, dmr_submissions_completed, dmr_submission_rate_pct,
    total_incidents, open_incidents,
    total_penalties, compliance_score, state_breakdown,
    generated_by
  ) VALUES (
    p_org_id, p_snapshot_date, 'daily',
    v_total_permits, v_active_permits, v_total_outfalls, v_active_outfalls,
    v_sampling_due, v_sampling_completed, v_sampling_pct,
    v_total_exceedances, v_open_exceedances, v_exceedance_rate,
    v_total_violations, v_open_violations, v_critical_violations,
    v_total_cas, v_open_cas, v_overdue_cas, v_avg_ca_days,
    v_total_wos, v_open_wos, v_overdue_wos,
    v_dmr_due, v_dmr_completed, v_dmr_rate,
    v_total_incidents, v_open_incidents,
    v_total_penalties, v_compliance_score, v_state_breakdown,
    auth.uid()
  )
  ON CONFLICT (organization_id, snapshot_date, snapshot_type)
  DO UPDATE SET
    total_permits = EXCLUDED.total_permits,
    active_permits = EXCLUDED.active_permits,
    total_outfalls = EXCLUDED.total_outfalls,
    active_outfalls = EXCLUDED.active_outfalls,
    sampling_events_due = EXCLUDED.sampling_events_due,
    sampling_events_completed = EXCLUDED.sampling_events_completed,
    sampling_compliance_pct = EXCLUDED.sampling_compliance_pct,
    total_exceedances = EXCLUDED.total_exceedances,
    open_exceedances = EXCLUDED.open_exceedances,
    exceedance_rate_pct = EXCLUDED.exceedance_rate_pct,
    total_violations = EXCLUDED.total_violations,
    open_violations = EXCLUDED.open_violations,
    critical_violations = EXCLUDED.critical_violations,
    total_corrective_actions = EXCLUDED.total_corrective_actions,
    open_corrective_actions = EXCLUDED.open_corrective_actions,
    overdue_corrective_actions = EXCLUDED.overdue_corrective_actions,
    avg_ca_closure_days = EXCLUDED.avg_ca_closure_days,
    total_work_orders = EXCLUDED.total_work_orders,
    open_work_orders = EXCLUDED.open_work_orders,
    overdue_work_orders = EXCLUDED.overdue_work_orders,
    dmr_submissions_due = EXCLUDED.dmr_submissions_due,
    dmr_submissions_completed = EXCLUDED.dmr_submissions_completed,
    dmr_submission_rate_pct = EXCLUDED.dmr_submission_rate_pct,
    total_incidents = EXCLUDED.total_incidents,
    open_incidents = EXCLUDED.open_incidents,
    total_penalties = EXCLUDED.total_penalties,
    compliance_score = EXCLUDED.compliance_score,
    state_breakdown = EXCLUDED.state_breakdown,
    generated_by = EXCLUDED.generated_by,
    created_at = now()
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_compliance_snapshot_daily_job()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org organizations%ROWTYPE;
  v_count integer := 0;
  v_run_id uuid;
BEGIN
  v_run_id := begin_job_run('generate-compliance-snapshot-daily', NULL);

  BEGIN
    FOR v_org IN SELECT id FROM organizations ORDER BY id LOOP
      PERFORM public.generate_compliance_snapshot(v_org.id, CURRENT_DATE);
      v_count := v_count + 1;
    END LOOP;

    PERFORM complete_job_run(v_run_id, 'succeeded', v_count, v_count, NULL);
    RETURN v_count;
  EXCEPTION WHEN OTHERS THEN
    PERFORM complete_job_run(v_run_id, 'failed', v_count, v_count, SQLERRM);
    RAISE;
  END;
END;
$$;

COMMENT ON FUNCTION public.run_compliance_snapshot_daily_job IS
  'Daily compliance snapshot for all orgs; logged in job_runs (Slice 5).';

GRANT EXECUTE ON FUNCTION public.run_compliance_snapshot_daily_job() TO service_role;

CREATE OR REPLACE FUNCTION get_job_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobs constant jsonb := jsonb_build_array(
    jsonb_build_object('job_name', 'detect-sampling-calendar-gaps-nightly', 'display_name', 'Sampling gap detection', 'cadence_hours', 26),
    jsonb_build_object('job_name', 'refresh-penalty-exposure-lines-daily', 'display_name', 'Penalty exposure refresh', 'cadence_hours', 26),
    jsonb_build_object('job_name', 'generate-compliance-snapshot-daily', 'display_name', 'Compliance snapshot', 'cadence_hours', 26),
    jsonb_build_object('job_name', 'sync-echo-weekly', 'display_name', 'ECHO weekly sync', 'cadence_hours', 180),
    jsonb_build_object('job_name', 'sync-msha-weekly', 'display_name', 'MSHA weekly sync', 'cadence_hours', 180),
    jsonb_build_object('job_name', 'dispatch-exceedance-digest-weekly', 'display_name', 'Exceedance digest', 'cadence_hours', 180),
    jsonb_build_object('job_name', 'sync-precipitation-daily', 'display_name', 'Precipitation sync', 'cadence_hours', 26),
    jsonb_build_object('job_name', 'detect-discrepancies-echo', 'display_name', 'ECHO discrepancy detection', 'cadence_hours', 720),
    jsonb_build_object('job_name', 'sync-echo-npdes-target', 'display_name', 'ECHO targeted NPDES sync', 'cadence_hours', 720)
  );
  v_result jsonb := '[]'::jsonb;
  v_job jsonb;
  v_last job_runs%ROWTYPE;
  v_hours_since numeric;
  v_stale boolean;
  v_presumed_failed boolean;
BEGIN
  FOR v_job IN SELECT * FROM jsonb_array_elements(v_jobs)
  LOOP
    SELECT * INTO v_last
    FROM job_runs jr
    WHERE jr.job_name = v_job->>'job_name'
    ORDER BY jr.started_at DESC
    LIMIT 1;

    v_hours_since := CASE
      WHEN v_last.id IS NULL THEN NULL
      ELSE EXTRACT(EPOCH FROM (now() - v_last.started_at)) / 3600.0
    END;

    v_stale := v_last.id IS NULL
      OR (v_last.status <> 'running' AND v_hours_since > (v_job->>'cadence_hours')::numeric)
      OR (v_last.status = 'running' AND v_hours_since > (v_job->>'cadence_hours')::numeric * 2);

    v_presumed_failed := v_last.status = 'running'
      AND v_hours_since > (v_job->>'cadence_hours')::numeric * 2;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'job_name', v_job->>'job_name',
      'display_name', v_job->>'display_name',
      'cadence_hours', (v_job->>'cadence_hours')::numeric,
      'last_run_id', v_last.id,
      'last_status', v_last.status,
      'last_started_at', v_last.started_at,
      'last_finished_at', v_last.finished_at,
      'hours_since_last_run', v_hours_since,
      'is_stale', v_stale,
      'presumed_failed', v_presumed_failed,
      'rows_scanned', v_last.rows_scanned,
      'rows_affected', v_last.rows_affected,
      'error_detail', v_last.error_detail
    ));
  END LOOP;

  RETURN jsonb_build_object('jobs', v_result, 'generated_at', now());
END;
$$;

SELECT cron.unschedule('generate-compliance-snapshot-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'generate-compliance-snapshot-daily'
);

SELECT cron.schedule(
  'generate-compliance-snapshot-daily',
  '30 6 * * *',
  $$ SELECT public.run_compliance_snapshot_daily_job(); $$
);
