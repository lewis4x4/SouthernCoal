-- Slice 3 remainder — batched per-permit ECHO discrepancy detect (149 permits)

CREATE OR REPLACE FUNCTION public.run_detect_discrepancies_echo_batch_job(
  p_organization_id uuid DEFAULT '2bffc35c-e2c4-4396-868f-207f80e1e2c4'::uuid,
  p_sleep_seconds integer DEFAULT 90
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_npdes text;
  v_count integer := 0;
  v_run_id uuid;
BEGIN
  v_run_id := begin_job_run('detect-discrepancies-echo-batch', p_organization_id);

  BEGIN
    FOR v_npdes IN
      SELECT DISTINCT upper(trim(npdes_id))
      FROM public.external_echo_facilities
      WHERE organization_id = p_organization_id
      ORDER BY 1
    LOOP
      PERFORM public.run_detect_discrepancies_echo_job(p_organization_id, ARRAY[v_npdes]);
      v_count := v_count + 1;
      IF p_sleep_seconds > 0 THEN
        PERFORM pg_sleep(p_sleep_seconds);
      END IF;
    END LOOP;

    PERFORM complete_job_run(v_run_id, 'succeeded', v_count, v_count, NULL);
    RETURN v_count;
  EXCEPTION WHEN OTHERS THEN
    PERFORM complete_job_run(v_run_id, 'failed', v_count, v_count, SQLERRM);
    RAISE;
  END;
END;
$$;

COMMENT ON FUNCTION public.run_detect_discrepancies_echo_batch_job IS
  'Sequential per-NPDES ECHO discrepancy detect; ~90s between Edge invocations (Slice 3 batch).';

GRANT EXECUTE ON FUNCTION public.run_detect_discrepancies_echo_batch_job(uuid, integer) TO service_role;

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
    jsonb_build_object('job_name', 'detect-discrepancies-echo-batch', 'display_name', 'ECHO batch discrepancy detect', 'cadence_hours', 720),
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
