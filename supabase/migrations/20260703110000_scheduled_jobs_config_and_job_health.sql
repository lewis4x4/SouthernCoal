-- DB-4: Move the hardcoded job catalog into a config table read by a single,
-- stable get_job_health(). Previously the catalog was copy-pasted across four
-- migrations, so every edit had to manually re-merge the prior list (a future
-- edit was guaranteed to drop entries). Also restrict error_detail — which can
-- contain sensitive internal error text — to admin/executive callers.

-- ---------------------------------------------------------------------------
-- 1. Config table: one row per scheduled job.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  job_name text PRIMARY KEY,
  display_name text NOT NULL,
  cadence_hours numeric NOT NULL CHECK (cadence_hours > 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scheduled_jobs IS
  'Catalog of background/cron jobs surfaced by get_job_health(). Single source of truth for the job list (DB-4).';

ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;

-- Config is not tenant-scoped (system-wide jobs); any authenticated user may
-- read it. Writes are service_role / migrations only (no write policy).
DROP POLICY IF EXISTS "Authenticated can read scheduled jobs" ON public.scheduled_jobs;
CREATE POLICY "Authenticated can read scheduled jobs"
  ON public.scheduled_jobs FOR SELECT
  TO authenticated
  USING (true);

-- Keep updated_at fresh if the standard trigger helper exists.
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    DROP TRIGGER IF EXISTS scheduled_jobs_set_updated_at ON public.scheduled_jobs;
    CREATE TRIGGER scheduled_jobs_set_updated_at
      BEFORE UPDATE ON public.scheduled_jobs
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$do$;

-- ---------------------------------------------------------------------------
-- 2. Seed the current catalog (idempotent — updates display/cadence on replay).
-- ---------------------------------------------------------------------------
INSERT INTO public.scheduled_jobs (job_name, display_name, cadence_hours, sort_order) VALUES
  ('detect-sampling-calendar-gaps-nightly', 'Sampling gap detection',      26,  10),
  ('refresh-penalty-exposure-lines-daily',  'Penalty exposure refresh',    26,  20),
  ('generate-compliance-snapshot-daily',    'Compliance snapshot',         26,  30),
  ('sync-echo-weekly',                      'ECHO weekly sync',           180,  40),
  ('sync-msha-weekly',                      'MSHA weekly sync',           180,  50),
  ('dispatch-exceedance-digest-weekly',     'Exceedance digest',          180,  60),
  ('sync-precipitation-daily',              'Precipitation sync',          26,  70),
  ('detect-discrepancies-echo',             'ECHO discrepancy detection', 720,  80),
  ('sync-echo-npdes-target',                'ECHO targeted NPDES sync',   720,  90)
ON CONFLICT (job_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  cadence_hours = EXCLUDED.cadence_hours,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 3. Single stable get_job_health() that reads the config table.
--    error_detail is only returned to admin/executive callers; everyone else
--    gets a has_error flag so the UI can still surface failures without leaking
--    internal error text.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_job_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_job public.scheduled_jobs%ROWTYPE;
  v_last job_runs%ROWTYPE;
  v_hours_since numeric;
  v_stale boolean;
  v_presumed_failed boolean;
  v_in_flight boolean;
  v_is_admin boolean;
BEGIN
  v_is_admin := EXISTS (
    SELECT 1
    FROM user_role_assignments ura
    JOIN roles r ON r.id = ura.role_id
    WHERE ura.user_id = auth.uid()
      AND r.name IN ('admin', 'executive')
  );

  FOR v_job IN
    SELECT * FROM public.scheduled_jobs
    WHERE is_active
    ORDER BY sort_order, job_name
  LOOP
    SELECT * INTO v_last
    FROM job_runs jr
    WHERE jr.job_name = v_job.job_name
    ORDER BY jr.started_at DESC
    LIMIT 1;

    v_hours_since := CASE
      WHEN v_last.id IS NULL THEN NULL
      ELSE EXTRACT(EPOCH FROM (now() - v_last.started_at)) / 3600.0
    END;

    v_in_flight := v_last.status IN ('running', 'dispatched');

    v_stale := v_last.id IS NULL
      OR (NOT v_in_flight AND v_hours_since > v_job.cadence_hours)
      OR (v_in_flight AND v_hours_since > v_job.cadence_hours * 2);

    v_presumed_failed := v_in_flight
      AND v_hours_since > v_job.cadence_hours * 2;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'job_name', v_job.job_name,
      'display_name', v_job.display_name,
      'cadence_hours', v_job.cadence_hours,
      'last_run_id', v_last.id,
      'last_status', v_last.status,
      'last_started_at', v_last.started_at,
      'last_finished_at', v_last.finished_at,
      'hours_since_last_run', v_hours_since,
      'is_stale', v_stale,
      'presumed_failed', v_presumed_failed,
      'rows_scanned', v_last.rows_scanned,
      'rows_affected', v_last.rows_affected,
      'has_error', v_last.error_detail IS NOT NULL,
      'error_detail', CASE WHEN v_is_admin THEN v_last.error_detail ELSE NULL END
    ));
  END LOOP;

  RETURN jsonb_build_object('jobs', v_result, 'generated_at', now());
END;
$function$;
