-- Lane C QW1: Nightly missed-sampling / calendar-gap detector
-- Compares sampling_calendar obligations to arrived lab_results; surfaces Missed / At-Risk queue.

-- ---------------------------------------------------------------------------
-- 1. Detection run log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sampling_gap_detection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  as_of_date date NOT NULL DEFAULT CURRENT_DATE,
  calendars_scanned integer NOT NULL DEFAULT 0,
  gaps_opened integer NOT NULL DEFAULT 0,
  gaps_updated integer NOT NULL DEFAULT 0,
  gaps_resolved integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  source text NOT NULL DEFAULT 'scheduled'
    CHECK (source IN ('scheduled', 'manual')),
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sampling_gap_runs_org_started
  ON sampling_gap_detection_runs(organization_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Gap queue records (advisory — no auto-priced penalties)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sampling_gap_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  calendar_id uuid NOT NULL REFERENCES sampling_calendar(id) ON DELETE CASCADE,
  detection_run_id uuid REFERENCES sampling_gap_detection_runs(id) ON DELETE SET NULL,
  gap_kind text NOT NULL CHECK (gap_kind IN ('at_risk', 'missed')),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'acknowledged', 'disputed', 'force_majeure', 'resolved')),
  scheduled_date date NOT NULL,
  window_end date,
  days_late integer NOT NULL DEFAULT 0,
  dispatch_status text,
  calendar_status text,
  field_visit_outcome text,
  field_visit_status text,
  skip_reason text,
  outfall_id uuid NOT NULL REFERENCES outfalls(id) ON DELETE CASCADE,
  parameter_id uuid NOT NULL REFERENCES parameters(id) ON DELETE CASCADE,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  reviewed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sampling_gap_records_open_calendar
  ON sampling_gap_records(calendar_id)
  WHERE review_status <> 'resolved';

CREATE INDEX IF NOT EXISTS idx_sampling_gap_records_org_status
  ON sampling_gap_records(organization_id, review_status, gap_kind, severity);

CREATE INDEX IF NOT EXISTS idx_sampling_gap_records_calendar
  ON sampling_gap_records(calendar_id);

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sampling_calendar_has_lab_result(p_calendar_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sampling_calendar sc
    WHERE sc.id = p_calendar_id
      AND (
        (
          sc.sampling_event_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM lab_results lr
            WHERE lr.sampling_event_id = sc.sampling_event_id
              AND lr.parameter_id = sc.parameter_id
          )
        )
        OR EXISTS (
          SELECT 1
          FROM sampling_events se
          JOIN lab_results lr
            ON lr.sampling_event_id = se.id
           AND lr.parameter_id = sc.parameter_id
          WHERE se.outfall_id = sc.outfall_id
            AND se.sample_date BETWEEN COALESCE(sc.window_start, sc.scheduled_date)
                                   AND COALESCE(sc.window_end, sc.scheduled_date)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION sampling_calendar_gap_severity(
  p_gap_kind text,
  p_days_late integer,
  p_days_until_due integer
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_gap_kind = 'missed' THEN
    IF p_days_late >= 30 THEN RETURN 'critical'; END IF;
    IF p_days_late >= 14 THEN RETURN 'high'; END IF;
    IF p_days_late >= 7 THEN RETURN 'medium'; END IF;
    RETURN 'low';
  END IF;

  IF p_days_until_due <= 1 THEN RETURN 'medium'; END IF;
  RETURN 'low';
END;
$$;

CREATE OR REPLACE FUNCTION sampling_calendar_is_documented_excuse(p_calendar_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sampling_calendar sc
    LEFT JOIN field_visits fv ON fv.id = sc.current_field_visit_id
    WHERE sc.id = p_calendar_id
      AND (
        sc.status IN ('skipped', 'no_discharge', 'cancelled')
        OR sc.dispatch_status = 'skipped'
        OR (
          fv.visit_status = 'completed'
          AND fv.outcome IN ('no_discharge', 'access_issue')
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Core detector (per org)
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

  PERFORM refresh_sampling_calendar_statuses(v_org_id, p_as_of);

  WITH resolved AS (
    UPDATE sampling_gap_records sgr
    SET review_status = 'resolved',
        resolved_at = now(),
        updated_at = now(),
        review_notes = COALESCE(review_notes, 'Auto-resolved: lab result or documented field outcome detected')
    WHERE sgr.organization_id = v_org_id
      AND sgr.review_status <> 'resolved'
      AND (
        sampling_calendar_has_lab_result(sgr.calendar_id)
        OR sampling_calendar_is_documented_excuse(sgr.calendar_id)
      )
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

    IF v_effective_due < p_as_of THEN
      v_gap_kind := 'missed';
    ELSIF v_effective_due <= p_as_of + p_at_risk_horizon_days THEN
      v_gap_kind := 'at_risk';
    ELSE
      CONTINUE;
    END IF;

    v_severity := sampling_calendar_gap_severity(v_gap_kind, v_days_late, v_days_until);

    SELECT id INTO v_existing_id
    FROM sampling_gap_records
    WHERE calendar_id = rec.calendar_id
      AND review_status <> 'resolved'
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      INSERT INTO sampling_gap_records (
        organization_id,
        calendar_id,
        detection_run_id,
        gap_kind,
        severity,
        scheduled_date,
        window_end,
        days_late,
        dispatch_status,
        calendar_status,
        field_visit_outcome,
        field_visit_status,
        skip_reason,
        outfall_id,
        parameter_id
      ) VALUES (
        v_org_id,
        rec.calendar_id,
        v_run_id,
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
      UPDATE sampling_gap_records
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

  UPDATE sampling_gap_detection_runs
  SET finished_at = now(),
      calendars_scanned = v_scanned,
      gaps_opened = v_opened,
      gaps_updated = v_updated,
      gaps_resolved = v_resolved,
      status = 'completed',
      metadata = jsonb_build_object(
        'at_risk_horizon_days', p_at_risk_horizon_days
      )
  WHERE id = v_run_id;

  INSERT INTO audit_log (
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
      'gaps_resolved', v_resolved
    ),
    'Calendar gap detection run completed'
  );

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'organization_id', v_org_id,
    'calendars_scanned', v_scanned,
    'gaps_opened', v_opened,
    'gaps_updated', v_updated,
    'gaps_resolved', v_resolved
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE sampling_gap_detection_runs
  SET finished_at = now(),
      status = 'failed',
      error_message = SQLERRM
  WHERE id = v_run_id;

  INSERT INTO audit_log (
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

CREATE OR REPLACE FUNCTION run_sampling_gap_detection_for_all_orgs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org organizations%ROWTYPE;
  v_count integer := 0;
BEGIN
  FOR v_org IN SELECT id FROM organizations LOOP
    PERFORM detect_sampling_calendar_gaps(v_org.id, CURRENT_DATE, 2, 'scheduled');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION update_sampling_gap_review_status(
  p_gap_id uuid,
  p_review_status text,
  p_review_notes text DEFAULT NULL
)
RETURNS sampling_gap_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row sampling_gap_records%ROWTYPE;
BEGIN
  IF p_review_status NOT IN ('pending', 'acknowledged', 'disputed', 'force_majeure', 'resolved') THEN
    RAISE EXCEPTION 'Invalid review status: %', p_review_status;
  END IF;

  UPDATE sampling_gap_records
  SET review_status = p_review_status,
      review_notes = COALESCE(p_review_notes, review_notes),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      resolved_at = CASE WHEN p_review_status = 'resolved' THEN now() ELSE resolved_at END,
      updated_at = now()
  WHERE id = p_gap_id
    AND organization_id = get_user_org_id()
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Gap record not found or not accessible';
  END IF;

  INSERT INTO audit_log (
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
      'calendar_id', v_row.calendar_id
    ),
    'Sampling gap triage updated'
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION detect_sampling_calendar_gaps(uuid, date, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION run_sampling_gap_detection_for_all_orgs() TO service_role;
GRANT EXECUTE ON FUNCTION update_sampling_gap_review_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION sampling_calendar_has_lab_result(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE sampling_gap_detection_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sampling_gap_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own org gap detection runs"
  ON sampling_gap_detection_runs FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Service role full access gap detection runs"
  ON sampling_gap_detection_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users view own org gap records"
  ON sampling_gap_records FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Managers update own org gap records"
  ON sampling_gap_records FOR UPDATE TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND can_manage_sampling_records()
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND can_manage_sampling_records()
  );

CREATE POLICY "Service role full access gap records"
  ON sampling_gap_records FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 6. Nightly cron (06:00 UTC)
-- ---------------------------------------------------------------------------
SELECT cron.unschedule('detect-sampling-calendar-gaps-nightly')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'detect-sampling-calendar-gaps-nightly'
);

SELECT cron.schedule(
  'detect-sampling-calendar-gaps-nightly',
  '0 6 * * *',
  $$ SELECT run_sampling_gap_detection_for_all_orgs(); $$
);

COMMENT ON TABLE sampling_gap_records IS
  'Advisory missed/at-risk sampling queue (Lane C QW1). Severity for human review — not auto-priced penalties.';
