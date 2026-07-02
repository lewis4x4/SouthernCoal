-- Code-review remediation (DB-2, DB-3, DB-7): make the job_runs ledger truthful.
--
-- Problems fixed:
--   DB-3  Cron wrappers marked job_runs 'succeeded' the instant net.http_post
--         *enqueued* a request, so a failing Edge Function still read as success.
--   DB-7  Four weekly wrappers used current_setting('app.settings.*') which is
--         NULL in prod, so they errored at runtime (net.http_post on a null url).
--   DB-2  run_detect_discrepancies_echo_batch_job looped pg_sleep(90) across all
--         NPDES ids inside one transaction — a multi-hour open transaction.
--
-- New model: wrappers open a run, dispatch via a shared helper that injects a
-- job_run_id into the body and marks the run 'dispatched'. The Edge Function
-- reports the real terminal status via complete_job_run. A reconcile cron is the
-- safety net (finalizes from the pg_net response, or fails runs stuck too long).

-- ---------------------------------------------------------------------------
-- Ledger schema: track the pg_net request id and allow an in-flight state.
-- ---------------------------------------------------------------------------
ALTER TABLE public.job_runs ADD COLUMN IF NOT EXISTS net_request_id bigint;

ALTER TABLE public.job_runs DROP CONSTRAINT IF EXISTS job_runs_status_check;
ALTER TABLE public.job_runs ADD CONSTRAINT job_runs_status_check
  CHECK (status = ANY (ARRAY['running'::text, 'dispatched'::text, 'succeeded'::text, 'failed'::text]));

-- ---------------------------------------------------------------------------
-- mark_job_run_dispatched — request enqueued; awaiting Edge Function callback.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_job_run_dispatched(p_run_id uuid, p_request_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE job_runs
  SET status = 'dispatched', net_request_id = p_request_id, transaction_time = now()
  WHERE id = p_run_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- dispatch_edge_job — single source of truth for firing a cron Edge Function.
-- Opens the ledger run, injects job_run_id into the body, posts with vault
-- credentials + internal secret, and marks the run 'dispatched'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_edge_job(
  p_job_name text,
  p_org_id uuid,
  p_function_path text,
  p_body jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id uuid;
  v_request_id bigint;
  v_service_key text;
  v_internal_secret text;
BEGIN
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key' LIMIT 1;
  SELECT decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets WHERE name = 'cron_internal_secret' LIMIT 1;
  IF v_internal_secret IS NULL THEN
    RAISE EXCEPTION 'cron_internal_secret missing from vault.decrypted_secrets';
  END IF;

  v_run_id := begin_job_run(p_job_name, p_org_id);

  BEGIN
    SELECT net.http_post(
      url := 'https://zymenlnwyzpnohljwifx.supabase.co/functions/v1/' || p_function_path,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || COALESCE(v_service_key, ''),
        'x-internal-secret', v_internal_secret,
        'Content-Type', 'application/json'
      ),
      body := p_body || jsonb_build_object('job_run_id', v_run_id),
      timeout_milliseconds := 150000
    ) INTO v_request_id;

    PERFORM mark_job_run_dispatched(v_run_id, v_request_id);
    RETURN v_request_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM complete_job_run(v_run_id, 'failed', 0, 0, SQLERRM);
    RAISE;
  END;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Rewire cron wrappers to dispatch_edge_job (fixes DB-3 + DB-7 uniformly).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_echo_weekly_sync_job()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN dispatch_edge_job('sync-echo-weekly', NULL, 'sync-echo-data',
    jsonb_build_object('sync_type', 'scheduled', 'stale_days', 7, 'stale_only', true, 'limit', 5, 'run_tag', 'cron-weekly-echo'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_msha_weekly_sync_job()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN dispatch_edge_job('sync-msha-weekly', NULL, 'sync-msha-data',
    jsonb_build_object('sync_type', 'scheduled', 'lookback_years', 5, 'run_tag', 'cron-weekly-msha'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_precipitation_sync_daily_job()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN dispatch_edge_job('sync-precipitation-daily', NULL, 'sync-precipitation-data', '{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_exceedance_digest_weekly_job()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN dispatch_edge_job('dispatch-exceedance-digest-weekly', '2bffc35c-e2c4-4396-868f-207f80e1e2c4'::uuid, 'dispatch-exceedance-alerts',
    jsonb_build_object('organization_id', '2bffc35c-e2c4-4396-868f-207f80e1e2c4', 'source', 'cron_weekly', 'force_digest', true));
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_detect_discrepancies_echo_job(p_organization_id uuid DEFAULT '2bffc35c-e2c4-4396-868f-207f80e1e2c4'::uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN dispatch_edge_job('detect-discrepancies-echo', p_organization_id, 'detect-discrepancies',
    jsonb_build_object('source', 'echo', 'organization_id', p_organization_id, 'run_tag', 'slice3-echo-rerun'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_detect_discrepancies_echo_job(p_organization_id uuid DEFAULT '2bffc35c-e2c4-4396-868f-207f80e1e2c4'::uuid, p_target_npdes_ids text[] DEFAULT NULL::text[])
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_body jsonb;
BEGIN
  v_body := jsonb_build_object('source', 'echo', 'organization_id', p_organization_id, 'run_tag', 'slice3-echo-rerun');
  IF p_target_npdes_ids IS NOT NULL AND array_length(p_target_npdes_ids, 1) > 0 THEN
    v_body := v_body || jsonb_build_object('target_npdes_ids', to_jsonb(p_target_npdes_ids));
  END IF;
  RETURN dispatch_edge_job('detect-discrepancies-echo', p_organization_id, 'detect-discrepancies', v_body);
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_sync_echo_npdes_job(p_npdes_id text, p_dmr_chunk_months integer DEFAULT NULL::integer, p_run_tag text DEFAULT 'slice3-echo-rerun'::text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_body jsonb;
BEGIN
  v_body := jsonb_build_object('target_npdes_ids', jsonb_build_array(upper(trim(p_npdes_id))), 'run_tag', p_run_tag);
  IF p_dmr_chunk_months IS NOT NULL AND p_dmr_chunk_months > 0 THEN
    v_body := v_body || jsonb_build_object('dmr_chunk_months', p_dmr_chunk_months);
  END IF;
  RETURN dispatch_edge_job('sync-echo-npdes-target', NULL, 'sync-echo-data', v_body);
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_sync_echo_npdes_job(p_npdes_id text, p_dmr_chunk_months integer DEFAULT NULL::integer, p_run_tag text DEFAULT 'slice3-echo-rerun'::text, p_dmr_chunk_index integer DEFAULT NULL::integer, p_dmr_only boolean DEFAULT false)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_body jsonb;
BEGIN
  v_body := jsonb_build_object('target_npdes_ids', jsonb_build_array(upper(trim(p_npdes_id))), 'run_tag', p_run_tag);
  IF p_dmr_chunk_months IS NOT NULL AND p_dmr_chunk_months > 0 THEN
    v_body := v_body || jsonb_build_object('dmr_chunk_months', p_dmr_chunk_months);
  END IF;
  IF p_dmr_chunk_index IS NOT NULL AND p_dmr_chunk_index >= 0 THEN
    v_body := v_body || jsonb_build_object('dmr_chunk_index', p_dmr_chunk_index);
  END IF;
  IF p_dmr_only THEN
    v_body := v_body || jsonb_build_object('dmr_only', true, 'skip_facility', true);
  END IF;
  RETURN dispatch_edge_job('sync-echo-npdes-target', NULL, 'sync-echo-data', v_body);
END;
$function$;

-- ---------------------------------------------------------------------------
-- DB-2: retire the long-transaction batch driver. Per-NPDES fan-out belongs in
-- the Node orchestration script (scripts/), never a pg_sleep loop in one txn.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.run_detect_discrepancies_echo_batch_job(uuid, integer);

-- ---------------------------------------------------------------------------
-- reconcile_dispatched_job_runs — safety net that finalizes in-flight runs.
--   • pg_net response present  → 2xx succeeded, else failed
--   • no response + too old     → failed (crash / lost callback)
-- Runs that the Edge Function already finalized via complete_job_run are no
-- longer 'dispatched' and are skipped.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_dispatched_job_runs(p_timeout_minutes integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_run job_runs%ROWTYPE;
  v_status_code integer;
  v_timed_out boolean;
  v_error_msg text;
  v_content text;
  v_finalized integer := 0;
BEGIN
  FOR v_run IN SELECT * FROM job_runs WHERE status = 'dispatched' LOOP
    v_status_code := NULL; v_timed_out := NULL; v_error_msg := NULL; v_content := NULL;

    IF v_run.net_request_id IS NOT NULL THEN
      SELECT status_code, timed_out, error_msg, content
      INTO v_status_code, v_timed_out, v_error_msg, v_content
      FROM net._http_response WHERE id = v_run.net_request_id;
    END IF;

    IF v_status_code IS NOT NULL OR v_timed_out IS NOT NULL OR v_error_msg IS NOT NULL THEN
      IF COALESCE(v_timed_out, false) THEN
        PERFORM complete_job_run(v_run.id, 'failed', NULL, NULL, 'Edge request timed out (pg_net)');
      ELSIF v_status_code BETWEEN 200 AND 299 THEN
        PERFORM complete_job_run(v_run.id, 'succeeded', NULL, NULL, NULL);
      ELSE
        PERFORM complete_job_run(v_run.id, 'failed', NULL, NULL,
          format('HTTP %s: %s', COALESCE(v_status_code, 0), COALESCE(left(v_content, 500), v_error_msg, 'no body')));
      END IF;
      v_finalized := v_finalized + 1;
    ELSIF now() - v_run.started_at > make_interval(mins => p_timeout_minutes) THEN
      PERFORM complete_job_run(v_run.id, 'failed', NULL, NULL,
        format('No Edge callback/response within %s min (pg_net request %s)', p_timeout_minutes, v_run.net_request_id));
      v_finalized := v_finalized + 1;
    END IF;
  END LOOP;

  RETURN v_finalized;
END;
$function$;

-- ---------------------------------------------------------------------------
-- get_job_health — treat 'dispatched' as in-flight (like 'running').
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_job_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_in_flight boolean;
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

    v_in_flight := v_last.status IN ('running', 'dispatched');

    v_stale := v_last.id IS NULL
      OR (NOT v_in_flight AND v_hours_since > (v_job->>'cadence_hours')::numeric)
      OR (v_in_flight AND v_hours_since > (v_job->>'cadence_hours')::numeric * 2);

    v_presumed_failed := v_in_flight
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
$function$;

-- ---------------------------------------------------------------------------
-- Schedule the reconcile safety-net every 10 minutes.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-job-runs') THEN
    PERFORM cron.unschedule('reconcile-job-runs');
  END IF;
  PERFORM cron.schedule('reconcile-job-runs', '*/10 * * * *',
    $$SELECT public.reconcile_dispatched_job_runs(30);$$);
END;
$do$;
