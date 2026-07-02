-- Slice 0 (§7.2 rules 4–5): job-run ledger + statutory alert acknowledgments
-- First consumer: ECHO discrepancy re-run must not fail silently.

-- ---------------------------------------------------------------------------
-- 1. job_runs — append-only run ledger (nullable org_id for global cron jobs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  job_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed')),
  rows_scanned integer,
  rows_affected integer,
  error_detail text,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  transaction_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_runs_name_started
  ON job_runs (job_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_runs_org_started
  ON job_runs (organization_id, started_at DESC)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_runs_running
  ON job_runs (started_at)
  WHERE status = 'running';

COMMENT ON TABLE job_runs IS
  'Append-only scheduled job run ledger (§7.2 r4). Completion updates status on the same row.';

ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own org job runs"
  ON job_runs FOR SELECT TO authenticated
  USING (organization_id IS NULL OR organization_id = get_user_org_id());

CREATE POLICY "Service role full access job runs"
  ON job_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. alert_acknowledgments — statutory alert ack (ack ≠ dismiss)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alert_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alert_type text NOT NULL
    CHECK (alert_type IN ('msha_abatement', 'edd_paragraph49', 'sampling_gap', 'exceedance_digest')),
  alert_ref_id uuid NOT NULL,
  acknowledged_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL DEFAULT 'ui',
  note text,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  transaction_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_ack_org_type_ref
  ON alert_acknowledgments (organization_id, alert_type, alert_ref_id, acknowledged_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_ack_active
  ON alert_acknowledgments (organization_id, alert_type, alert_ref_id)
  WHERE valid_to IS NULL;

COMMENT ON TABLE alert_acknowledgments IS
  'Named human acknowledgment of statutory alert surfaces (§7.2 r5). Does not dismiss or resolve alerts.';

ALTER TABLE alert_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own org alert acks"
  ON alert_acknowledgments FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Managers insert own org alert acks"
  ON alert_acknowledgments FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    AND acknowledged_by = auth.uid()
  );

CREATE POLICY "Service role full access alert acks"
  ON alert_acknowledgments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. Job run helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION begin_job_run(
  p_job_name text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
BEGIN
  INSERT INTO job_runs (organization_id, job_name, status)
  VALUES (p_organization_id, p_job_name, 'running')
  RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION complete_job_run(
  p_run_id uuid,
  p_status text,
  p_rows_scanned integer DEFAULT NULL,
  p_rows_affected integer DEFAULT NULL,
  p_error_detail text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row job_runs%ROWTYPE;
BEGIN
  IF p_status NOT IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION 'Invalid job run status: %', p_status;
  END IF;

  UPDATE job_runs
  SET status = p_status,
      finished_at = now(),
      rows_scanned = COALESCE(p_rows_scanned, rows_scanned),
      rows_affected = COALESCE(p_rows_affected, rows_affected),
      error_detail = p_error_detail,
      transaction_time = now()
  WHERE id = p_run_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Job run not found: %', p_run_id;
  END IF;

  IF p_status = 'failed' THEN
    INSERT INTO audit_log (
      organization_id,
      action,
      module,
      table_name,
      record_id,
      new_values,
      description
    ) VALUES (
      v_row.organization_id,
      'scheduled_job_failed',
      'system_health',
      'job_runs',
      v_row.id,
      jsonb_build_object(
        'job_name', v_row.job_name,
        'error', p_error_detail,
        'rows_scanned', p_rows_scanned,
        'rows_affected', p_rows_affected
      ),
      format('Scheduled job %s failed', v_row.job_name)
    );
  END IF;
END;
$$;

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
    jsonb_build_object('job_name', 'sync-echo-weekly', 'display_name', 'ECHO weekly sync', 'cadence_hours', 180),
    jsonb_build_object('job_name', 'sync-msha-weekly', 'display_name', 'MSHA weekly sync', 'cadence_hours', 180),
    jsonb_build_object('job_name', 'dispatch-exceedance-digest-weekly', 'display_name', 'Exceedance digest', 'cadence_hours', 180),
    jsonb_build_object('job_name', 'sync-precipitation-daily', 'display_name', 'Precipitation sync', 'cadence_hours', 26)
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

-- QA-only forced failure path (service_role)
CREATE OR REPLACE FUNCTION simulate_scheduled_job_failure(p_job_name text DEFAULT 'qa-simulated-failure')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
BEGIN
  v_run_id := begin_job_run(p_job_name, NULL);
  PERFORM complete_job_run(v_run_id, 'failed', 0, 0, 'Simulated failure for QA');
  RETURN v_run_id;
END;
$$;

GRANT EXECUTE ON FUNCTION begin_job_run(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION complete_job_run(uuid, text, integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION get_job_health() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION simulate_scheduled_job_failure(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Wrap scheduled entrypoints
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION run_sampling_gap_detection_for_all_orgs()
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
  v_run_id := begin_job_run('detect-sampling-calendar-gaps-nightly', NULL);

  BEGIN
    FOR v_org IN SELECT id FROM organizations LOOP
      PERFORM detect_sampling_calendar_gaps(v_org.id, CURRENT_DATE, 2, 'scheduled');
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

CREATE OR REPLACE FUNCTION run_penalty_exposure_refresh_for_all_orgs()
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
  v_run_id := begin_job_run('refresh-penalty-exposure-lines-daily', NULL);

  BEGIN
    FOR v_org IN SELECT id FROM organizations LOOP
      PERFORM refresh_penalty_exposure_lines(v_org.id);
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

CREATE OR REPLACE FUNCTION run_echo_weekly_sync_job()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_request_id bigint;
BEGIN
  v_run_id := begin_job_run('sync-echo-weekly', NULL);

  BEGIN
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-echo-data',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'sync_type', 'scheduled',
        'stale_days', 7,
        'stale_only', true,
        'limit', 5,
        'run_tag', 'cron-weekly-echo'
      )
    ) INTO v_request_id;

    PERFORM complete_job_run(v_run_id, 'succeeded', 1, 1, NULL);
    RETURN v_request_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM complete_job_run(v_run_id, 'failed', 0, 0, SQLERRM);
    RAISE;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION run_msha_weekly_sync_job()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_request_id bigint;
BEGIN
  v_run_id := begin_job_run('sync-msha-weekly', NULL);

  BEGIN
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-msha-data',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'sync_type', 'scheduled',
        'lookback_years', 5,
        'run_tag', 'cron-weekly-msha'
      )
    ) INTO v_request_id;

    PERFORM complete_job_run(v_run_id, 'succeeded', 1, 1, NULL);
    RETURN v_request_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM complete_job_run(v_run_id, 'failed', 0, 0, SQLERRM);
    RAISE;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION run_exceedance_digest_weekly_job()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_request_id bigint;
BEGIN
  v_run_id := begin_job_run('dispatch-exceedance-digest-weekly', NULL);

  BEGIN
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/dispatch-exceedance-alerts',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'organization_id', '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
        'source', 'cron_weekly',
        'force_digest', true
      )
    ) INTO v_request_id;

    PERFORM complete_job_run(v_run_id, 'succeeded', 1, 1, NULL);
    RETURN v_request_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM complete_job_run(v_run_id, 'failed', 0, 0, SQLERRM);
    RAISE;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION run_precipitation_sync_daily_job()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_request_id bigint;
BEGIN
  v_run_id := begin_job_run('sync-precipitation-daily', NULL);

  BEGIN
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-precipitation-data',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    ) INTO v_request_id;

    PERFORM complete_job_run(v_run_id, 'succeeded', 1, 1, NULL);
    RETURN v_request_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM complete_job_run(v_run_id, 'failed', 0, 0, SQLERRM);
    RAISE;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION run_sampling_gap_detection_for_all_orgs() TO service_role;
GRANT EXECUTE ON FUNCTION run_penalty_exposure_refresh_for_all_orgs() TO service_role;
GRANT EXECUTE ON FUNCTION run_echo_weekly_sync_job() TO service_role;
GRANT EXECUTE ON FUNCTION run_msha_weekly_sync_job() TO service_role;
GRANT EXECUTE ON FUNCTION run_exceedance_digest_weekly_job() TO service_role;
GRANT EXECUTE ON FUNCTION run_precipitation_sync_daily_job() TO service_role;

-- Reschedule crons to wrapped entrypoints
SELECT cron.unschedule('detect-sampling-calendar-gaps-nightly')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'detect-sampling-calendar-gaps-nightly'
);

SELECT cron.schedule(
  'detect-sampling-calendar-gaps-nightly',
  '0 6 * * *',
  $$ SELECT run_sampling_gap_detection_for_all_orgs(); $$
);

SELECT cron.unschedule('refresh-obligation-penalties-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-obligation-penalties-daily');

SELECT cron.schedule(
  'refresh-penalty-exposure-lines-daily',
  '15 6 * * *',
  $$ SELECT run_penalty_exposure_refresh_for_all_orgs(); $$
);

SELECT cron.unschedule('sync-echo-weekly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-echo-weekly');

SELECT cron.schedule(
  'sync-echo-weekly',
  '0 4 * * 0',
  $$ SELECT run_echo_weekly_sync_job(); $$
);

SELECT cron.unschedule('sync-msha-weekly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-msha-weekly');

SELECT cron.schedule(
  'sync-msha-weekly',
  '0 5 * * 6',
  $$ SELECT run_msha_weekly_sync_job(); $$
);

SELECT cron.unschedule('dispatch-exceedance-digest-weekly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-exceedance-digest-weekly');

SELECT cron.schedule(
  'dispatch-exceedance-digest-weekly',
  '0 5 * * 1',
  $$ SELECT run_exceedance_digest_weekly_job(); $$
);

SELECT cron.unschedule('sync-precipitation-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-precipitation-daily');

SELECT cron.schedule(
  'sync-precipitation-daily',
  '0 10 * * *',
  $$ SELECT run_precipitation_sync_daily_job(); $$
);

-- ---------------------------------------------------------------------------
-- 5. Statutory alert acknowledgment RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION acknowledge_alert(
  p_alert_type text,
  p_alert_ref_id uuid,
  p_note text DEFAULT NULL,
  p_channel text DEFAULT 'ui'
)
RETURNS alert_acknowledgments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := get_user_org_id();
  v_row alert_acknowledgments%ROWTYPE;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization context';
  END IF;

  IF p_alert_type NOT IN ('msha_abatement', 'edd_paragraph49', 'sampling_gap', 'exceedance_digest') THEN
    RAISE EXCEPTION 'Invalid alert type: %', p_alert_type;
  END IF;

  UPDATE alert_acknowledgments
  SET valid_to = now(), transaction_time = now()
  WHERE organization_id = v_org_id
    AND alert_type = p_alert_type
    AND alert_ref_id = p_alert_ref_id
    AND valid_to IS NULL;

  INSERT INTO alert_acknowledgments (
    organization_id,
    alert_type,
    alert_ref_id,
    acknowledged_by,
    channel,
    note
  ) VALUES (
    v_org_id,
    p_alert_type,
    p_alert_ref_id,
    auth.uid(),
    COALESCE(p_channel, 'ui'),
    p_note
  )
  RETURNING * INTO v_row;

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
    v_org_id,
    'statutory_alert_acknowledged',
    'environmental_compliance',
    'alert_acknowledgments',
    v_row.id,
    jsonb_build_object(
      'alert_type', p_alert_type,
      'alert_ref_id', p_alert_ref_id,
      'channel', p_channel
    ),
    'Statutory alert acknowledged (ack ≠ dismiss)'
  );

  RETURN v_row;
END;
$$;

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

  RETURN jsonb_build_object(
    'msha_abatement', v_msha,
    'edd_paragraph49', v_edd,
    'sampling_gap', v_gaps,
    'counts', jsonb_build_object(
      'msha_abatement', jsonb_array_length(v_msha),
      'edd_paragraph49', jsonb_array_length(v_edd),
      'sampling_gap', jsonb_array_length(v_gaps),
      'total', jsonb_array_length(v_msha) + jsonb_array_length(v_edd) + jsonb_array_length(v_gaps)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION acknowledge_alert(text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unacknowledged_statutory_alerts(uuid) TO authenticated;
