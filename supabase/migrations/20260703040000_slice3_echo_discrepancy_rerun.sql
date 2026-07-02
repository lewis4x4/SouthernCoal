-- Slice 3 — ECHO discrepancy re-run job wrapper (job_runs ledger)
-- Uses vault.decrypted_secrets (cron_service_role_key) — prod has no app.settings GUCs.

CREATE OR REPLACE FUNCTION run_detect_discrepancies_echo_job(
  p_organization_id uuid DEFAULT '2bffc35c-e2c4-4396-868f-207f80e1e2c4'::uuid,
  p_target_npdes_ids text[] DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_request_id bigint;
  v_service_key text;
  v_internal_secret text;
  v_body jsonb;
BEGIN
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'cron_service_role_key'
  LIMIT 1;

  SELECT decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cron_internal_secret'
  LIMIT 1;

  IF v_internal_secret IS NULL THEN
    RAISE EXCEPTION 'cron_internal_secret missing from vault.decrypted_secrets';
  END IF;

  v_run_id := begin_job_run('detect-discrepancies-echo', p_organization_id);

  v_body := jsonb_build_object(
    'source', 'echo',
    'organization_id', p_organization_id,
    'run_tag', 'slice3-echo-rerun'
  );
  IF p_target_npdes_ids IS NOT NULL AND array_length(p_target_npdes_ids, 1) > 0 THEN
    v_body := v_body || jsonb_build_object('target_npdes_ids', to_jsonb(p_target_npdes_ids));
  END IF;

  BEGIN
    SELECT net.http_post(
      url := 'https://zymenlnwyzpnohljwifx.supabase.co/functions/v1/detect-discrepancies',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || COALESCE(v_service_key, ''),
        'x-internal-secret', v_internal_secret,
        'Content-Type', 'application/json'
      ),
      body := v_body
    ) INTO v_request_id;

    PERFORM complete_job_run(v_run_id, 'succeeded', 1, 1, NULL);
    RETURN v_request_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM complete_job_run(v_run_id, 'failed', 0, 0, SQLERRM);
    RAISE;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION run_sync_echo_npdes_job(
  p_npdes_id text,
  p_dmr_chunk_months integer DEFAULT NULL,
  p_run_tag text DEFAULT 'slice3-echo-rerun',
  p_dmr_chunk_index integer DEFAULT NULL,
  p_dmr_only boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_request_id bigint;
  v_service_key text;
  v_internal_secret text;
  v_body jsonb;
BEGIN
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'cron_service_role_key'
  LIMIT 1;

  SELECT decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cron_internal_secret'
  LIMIT 1;

  IF v_internal_secret IS NULL THEN
    RAISE EXCEPTION 'cron_internal_secret missing from vault.decrypted_secrets';
  END IF;

  v_run_id := begin_job_run('sync-echo-npdes-target', NULL);

  v_body := jsonb_build_object(
    'target_npdes_ids', jsonb_build_array(upper(trim(p_npdes_id))),
    'run_tag', p_run_tag
  );
  IF p_dmr_chunk_months IS NOT NULL AND p_dmr_chunk_months > 0 THEN
    v_body := v_body || jsonb_build_object('dmr_chunk_months', p_dmr_chunk_months);
  END IF;
  IF p_dmr_chunk_index IS NOT NULL AND p_dmr_chunk_index >= 0 THEN
    v_body := v_body || jsonb_build_object('dmr_chunk_index', p_dmr_chunk_index);
  END IF;
  IF p_dmr_only THEN
    v_body := v_body || jsonb_build_object('dmr_only', true, 'skip_facility', true);
  END IF;

  BEGIN
    SELECT net.http_post(
      url := 'https://zymenlnwyzpnohljwifx.supabase.co/functions/v1/sync-echo-data',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || COALESCE(v_service_key, ''),
        'x-internal-secret', v_internal_secret,
        'Content-Type', 'application/json'
      ),
      body := v_body
    ) INTO v_request_id;

    PERFORM complete_job_run(v_run_id, 'succeeded', 1, 1, NULL);
    RETURN v_request_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM complete_job_run(v_run_id, 'failed', 0, 0, SQLERRM);
    RAISE;
  END;
END;
$$;

COMMENT ON FUNCTION run_detect_discrepancies_echo_job IS
  'Fire-and-forget ECHO discrepancy detection via Edge Function; logged in job_runs (Slice 3).';

COMMENT ON FUNCTION run_sync_echo_npdes_job IS
  'Targeted ECHO sync for one NPDES ID (date-range-chunked DMR fetch); logged in job_runs (Slice 3).';

GRANT EXECUTE ON FUNCTION run_detect_discrepancies_echo_job(uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION run_sync_echo_npdes_job(text, integer, text, integer, boolean) TO service_role;

-- Extend job health catalog
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
