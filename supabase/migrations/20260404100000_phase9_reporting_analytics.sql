-- Phase 9: Compliance Reporting & Analytics
--
-- 9A. Compliance Snapshots — point-in-time compliance posture
-- 9B. KPI Targets — configurable thresholds per org
-- 9C. Scheduled Reports — report definitions with cron
-- 9D. Report Runs — execution log
-- 9E. RPCs for snapshot generation and trend retrieval

-- ============================================================================
-- 1. Compliance Snapshots
-- ============================================================================
CREATE TABLE IF NOT EXISTS compliance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  snapshot_type text NOT NULL DEFAULT 'daily'
    CHECK (snapshot_type IN ('daily', 'weekly', 'monthly')),
  -- Permit & outfall metrics
  total_permits integer NOT NULL DEFAULT 0,
  active_permits integer NOT NULL DEFAULT 0,
  total_outfalls integer NOT NULL DEFAULT 0,
  active_outfalls integer NOT NULL DEFAULT 0,
  -- Sampling metrics
  sampling_events_due integer NOT NULL DEFAULT 0,
  sampling_events_completed integer NOT NULL DEFAULT 0,
  sampling_compliance_pct numeric(5,2) NOT NULL DEFAULT 0,
  -- Exceedance metrics
  total_exceedances integer NOT NULL DEFAULT 0,
  open_exceedances integer NOT NULL DEFAULT 0,
  exceedance_rate_pct numeric(5,2) NOT NULL DEFAULT 0,
  -- Violation metrics
  total_violations integer NOT NULL DEFAULT 0,
  open_violations integer NOT NULL DEFAULT 0,
  critical_violations integer NOT NULL DEFAULT 0,
  -- CA metrics
  total_corrective_actions integer NOT NULL DEFAULT 0,
  open_corrective_actions integer NOT NULL DEFAULT 0,
  overdue_corrective_actions integer NOT NULL DEFAULT 0,
  avg_ca_closure_days numeric(5,1),
  -- Work order metrics
  total_work_orders integer NOT NULL DEFAULT 0,
  open_work_orders integer NOT NULL DEFAULT 0,
  overdue_work_orders integer NOT NULL DEFAULT 0,
  -- DMR metrics
  dmr_submissions_due integer NOT NULL DEFAULT 0,
  dmr_submissions_completed integer NOT NULL DEFAULT 0,
  dmr_submission_rate_pct numeric(5,2) NOT NULL DEFAULT 0,
  -- Incident metrics
  total_incidents integer NOT NULL DEFAULT 0,
  open_incidents integer NOT NULL DEFAULT 0,
  -- Financial
  total_penalties numeric NOT NULL DEFAULT 0,
  -- Overall compliance score (0–100)
  compliance_score numeric(5,2) NOT NULL DEFAULT 0,
  -- State breakdown (jsonb array)
  state_breakdown jsonb,
  -- Metadata
  generated_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT snapshots_unique_date UNIQUE (organization_id, snapshot_date, snapshot_type)
);

ALTER TABLE compliance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY snapshots_org_read ON compliance_snapshots
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY snapshots_org_insert ON compliance_snapshots
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

-- ============================================================================
-- 2. KPI Targets
-- ============================================================================
CREATE TABLE IF NOT EXISTS kpi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kpi_key text NOT NULL,
  display_name text NOT NULL,
  description text,
  -- Thresholds
  target_value numeric NOT NULL,
  warning_threshold numeric,
  critical_threshold numeric,
  -- Direction: 'above' means >= target is green, 'below' means <= target is green
  direction text NOT NULL DEFAULT 'above'
    CHECK (direction IN ('above', 'below')),
  unit text,
  -- Active
  is_active boolean NOT NULL DEFAULT true,
  -- Metadata
  updated_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kpi_targets_unique UNIQUE (organization_id, kpi_key)
);

ALTER TABLE kpi_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY kpi_targets_org_read ON kpi_targets
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY kpi_targets_org_insert ON kpi_targets
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY kpi_targets_org_update ON kpi_targets
  FOR UPDATE USING (organization_id = get_user_org_id());

-- ============================================================================
-- 3. Scheduled Reports
-- ============================================================================
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Report definition
  title text NOT NULL,
  report_type text NOT NULL
    CHECK (report_type IN (
      'compliance_summary', 'exceedance_detail', 'sampling_status',
      'violation_summary', 'ca_status', 'work_order_status',
      'dmr_status', 'executive_brief', 'state_breakdown',
      'custom'
    )),
  description text,
  -- Format
  output_format text NOT NULL DEFAULT 'csv'
    CHECK (output_format IN ('csv', 'pdf', 'markdown')),
  -- Schedule (cron-style)
  schedule_cron text,
  is_active boolean NOT NULL DEFAULT true,
  -- Filters
  state_filter text[],
  site_filter uuid[],
  date_range_days integer DEFAULT 30,
  -- Recipients (email addresses)
  recipients text[] NOT NULL DEFAULT '{}',
  -- Execution tracking
  last_run_at timestamptz,
  next_run_at timestamptz,
  run_count integer NOT NULL DEFAULT 0,
  -- Metadata
  created_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY sched_reports_org_read ON scheduled_reports
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY sched_reports_org_insert ON scheduled_reports
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY sched_reports_org_update ON scheduled_reports
  FOR UPDATE USING (organization_id = get_user_org_id());

CREATE POLICY sched_reports_org_delete ON scheduled_reports
  FOR DELETE USING (organization_id = get_user_org_id());

-- ============================================================================
-- 4. Report Runs
-- ============================================================================
CREATE TABLE IF NOT EXISTS report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_report_id uuid NOT NULL REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  -- Execution
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  -- Output
  file_path text,
  file_size_bytes integer,
  row_count integer,
  -- Errors
  error_message text,
  -- Trigger
  triggered_by text NOT NULL DEFAULT 'manual'
    CHECK (triggered_by IN ('manual', 'scheduled', 'api')),
  triggered_by_user uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE report_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_runs_read ON report_runs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM scheduled_reports sr
      WHERE sr.id = report_runs.scheduled_report_id
        AND sr.organization_id = get_user_org_id()
    )
  );

CREATE POLICY report_runs_insert ON report_runs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM scheduled_reports sr
      WHERE sr.id = report_runs.scheduled_report_id
        AND sr.organization_id = get_user_org_id()
    )
  );

-- ============================================================================
-- 5. Generate Compliance Snapshot RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_compliance_snapshot(
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
  -- Verify user belongs to org
  IF get_user_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Permits
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'active')
  INTO v_total_permits, v_active_permits
  FROM npdes_permits WHERE organization_id = p_org_id;

  -- Outfalls
  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active = true)
  INTO v_total_outfalls, v_active_outfalls
  FROM outfalls o
  JOIN npdes_permits p ON o.permit_id = p.id
  WHERE p.organization_id = p_org_id;

  -- Sampling (last 30 days)
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE se.status = 'completed')
  INTO v_sampling_due, v_sampling_completed
  FROM sampling_events se
  JOIN outfalls o ON se.outfall_id = o.id
  JOIN npdes_permits p ON o.permit_id = p.id
  WHERE p.organization_id = p_org_id
    AND se.scheduled_date >= p_snapshot_date - INTERVAL '30 days'
    AND se.scheduled_date <= p_snapshot_date;

  v_sampling_pct := CASE WHEN v_sampling_due > 0
    THEN ROUND((v_sampling_completed::numeric / v_sampling_due) * 100, 2)
    ELSE 100 END;

  -- Exceedances
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'open')
  INTO v_total_exceedances, v_open_exceedances
  FROM exceedances
  WHERE organization_id = p_org_id;

  v_exceedance_rate := CASE WHEN v_sampling_completed > 0
    THEN ROUND((v_total_exceedances::numeric / v_sampling_completed) * 100, 2)
    ELSE 0 END;

  -- Violations
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('open', 'under_investigation')),
    COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('resolved', 'closed'))
  INTO v_total_violations, v_open_violations, v_critical_violations
  FROM compliance_violations WHERE organization_id = p_org_id;

  -- Corrective Actions
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
  FROM corrective_actions WHERE organization_id = p_org_id;

  -- Work Orders
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status NOT IN ('completed', 'verified', 'cancelled')),
    COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('completed', 'verified', 'cancelled'))
  INTO v_total_wos, v_open_wos, v_overdue_wos
  FROM work_orders WHERE organization_id = p_org_id;

  -- DMR Submissions (current quarter)
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('submitted', 'accepted'))
  INTO v_dmr_due, v_dmr_completed
  FROM dmr_submissions WHERE organization_id = p_org_id
    AND period_start >= date_trunc('quarter', p_snapshot_date::timestamp)::date;

  v_dmr_rate := CASE WHEN v_dmr_due > 0
    THEN ROUND((v_dmr_completed::numeric / v_dmr_due) * 100, 2)
    ELSE 100 END;

  -- Incidents
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('open', 'investigating'))
  INTO v_total_incidents, v_open_incidents
  FROM incidents WHERE organization_id = p_org_id;

  -- Penalties
  SELECT COALESCE(SUM(COALESCE(actual_penalty, estimated_penalty, 0)), 0)
  INTO v_total_penalties
  FROM compliance_violations WHERE organization_id = p_org_id;

  -- Compliance score: weighted average
  -- 40% sampling compliance, 25% exceedance-free rate, 20% CA on-time, 15% DMR rate
  v_compliance_score := ROUND(
    (v_sampling_pct * 0.40) +
    ((100 - LEAST(v_exceedance_rate, 100)) * 0.25) +
    (CASE WHEN v_total_cas > 0
      THEN ((v_total_cas - v_overdue_cas)::numeric / v_total_cas) * 100
      ELSE 100 END * 0.20) +
    (v_dmr_rate * 0.15),
    2
  );

  -- State breakdown
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
    FROM sites s
    LEFT JOIN npdes_permits p ON p.site_id = s.id AND p.organization_id = p_org_id
    LEFT JOIN outfalls o ON o.permit_id = p.id
    LEFT JOIN exceedances e ON e.outfall_id = o.id
    LEFT JOIN compliance_violations cv ON cv.site_id = s.id AND cv.organization_id = p_org_id
    WHERE s.organization_id = p_org_id
    GROUP BY s.state_code
  ) sub;

  -- Upsert snapshot
  INSERT INTO compliance_snapshots (
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

-- ============================================================================
-- 6. Get Compliance Trend RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION get_compliance_trend(
  p_org_id uuid,
  p_days integer DEFAULT 30
)
RETURNS TABLE (
  snapshot_date date,
  compliance_score numeric,
  sampling_compliance_pct numeric,
  exceedance_rate_pct numeric,
  open_violations integer,
  open_corrective_actions integer,
  open_work_orders integer,
  open_incidents integer,
  total_penalties numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF get_user_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    cs.snapshot_date,
    cs.compliance_score,
    cs.sampling_compliance_pct,
    cs.exceedance_rate_pct,
    cs.open_violations,
    cs.open_corrective_actions,
    cs.open_work_orders,
    cs.open_incidents,
    cs.total_penalties
  FROM compliance_snapshots cs
  WHERE cs.organization_id = p_org_id
    AND cs.snapshot_type = 'daily'
    AND cs.snapshot_date >= CURRENT_DATE - (p_days || ' days')::interval
  ORDER BY cs.snapshot_date ASC;
END;
$$;

-- ============================================================================
-- 7. Seed Default KPI Targets (per org)
-- ============================================================================
DO $$
DECLARE
  v_org_id uuid;
BEGIN
  FOR v_org_id IN SELECT id FROM organizations LOOP
    INSERT INTO kpi_targets (organization_id, kpi_key, display_name, description, target_value, warning_threshold, critical_threshold, direction, unit) VALUES
      (v_org_id, 'sampling_compliance', 'Sampling Compliance', 'Percentage of scheduled samples collected', 95, 85, 75, 'above', '%'),
      (v_org_id, 'exceedance_rate', 'Exceedance Rate', 'Percentage of samples exceeding permit limits', 2, 5, 10, 'below', '%'),
      (v_org_id, 'ca_closure_days', 'CA Avg Closure Days', 'Average days to close corrective actions', 30, 45, 60, 'below', 'days'),
      (v_org_id, 'dmr_submission_rate', 'DMR Submission Rate', 'Percentage of DMRs submitted on time', 100, 90, 80, 'above', '%'),
      (v_org_id, 'open_violations', 'Open Violations', 'Number of unresolved violations', 0, 3, 5, 'below', 'count'),
      (v_org_id, 'compliance_score', 'Overall Compliance Score', 'Weighted compliance posture score', 90, 80, 70, 'above', 'score')
    ON CONFLICT (organization_id, kpi_key) DO NOTHING;
  END LOOP;
END;
$$;

-- ============================================================================
-- 8. Triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION update_scheduled_report_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scheduled_report_updated ON scheduled_reports;
CREATE TRIGGER trg_scheduled_report_updated
  BEFORE UPDATE ON scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION update_scheduled_report_timestamp();

DROP TRIGGER IF EXISTS trg_kpi_target_updated ON kpi_targets;
CREATE TRIGGER trg_kpi_target_updated
  BEFORE UPDATE ON kpi_targets
  FOR EACH ROW EXECUTE FUNCTION update_scheduled_report_timestamp();

-- ============================================================================
-- 9. Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_snapshots_org_date
  ON compliance_snapshots (organization_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_org_type_date
  ON compliance_snapshots (organization_id, snapshot_type, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_kpi_targets_org
  ON kpi_targets (organization_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_org
  ON scheduled_reports (organization_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_report_runs_report
  ON report_runs (scheduled_report_id, created_at DESC);
