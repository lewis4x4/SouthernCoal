-- Slice 5 final: CMS production schema (no legacy column references at parse time)

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
BEGIN
  IF get_user_org_id() IS NOT NULL AND get_user_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

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
    COUNT(*) FILTER (WHERE se.status IN ('completed', 'results_received'))
  INTO v_sampling_due, v_sampling_completed
  FROM public.sampling_events se
  JOIN public.outfalls o ON se.outfall_id = o.id
  JOIN public.npdes_permits p ON o.permit_id = p.id
  WHERE p.organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, p.site_id, p.id, o.id)
    AND se.sample_date >= p_snapshot_date - INTERVAL '30 days'
    AND se.sample_date <= p_snapshot_date;

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
      CASE WHEN closed_date IS NOT NULL
        THEN (closed_date - COALESCE(date_issued::date, created_at::date))::numeric
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

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE ds.status IN ('submitted', 'accepted'))
  INTO v_dmr_due, v_dmr_completed
  FROM public.dmr_submissions ds
  JOIN public.npdes_permits p ON p.id = ds.permit_id
  WHERE p.organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, p.site_id, ds.permit_id, NULL)
    AND ds.reporting_period_start >= date_trunc('quarter', p_snapshot_date::timestamp)::date;

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
      st.code AS state_code,
      COUNT(DISTINCT p.id) AS permit_count,
      COUNT(DISTINCT o.id) AS outfall_count,
      COUNT(DISTINCT e.id) AS exc_count,
      COUNT(DISTINCT cv.id) AS viol_count
    FROM public.sites s
    JOIN public.states st ON st.id = s.state_id
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
    GROUP BY st.code
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
