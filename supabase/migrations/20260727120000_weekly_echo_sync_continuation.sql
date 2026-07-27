-- Drain the weekly ECHO stale-permit backlog through small, resumable jobs.
--
-- Each Edge invocation still handles at most five permits. A completed batch
-- dispatches the exact remaining NPDES ids through dispatch_edge_job, so every
-- continuation gets its own truthful job_runs entry and pg_net request id.

CREATE TABLE IF NOT EXISTS public.echo_sync_continuations (
  root_job_run_id text NOT NULL,
  batch_number integer NOT NULL CHECK (batch_number >= 2),
  net_request_id bigint,
  remaining_npdes_ids text[] NOT NULL,
  coverage_npdes_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  failed_npdes_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  unresolved_npdes_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  run_tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  PRIMARY KEY (root_job_run_id, batch_number)
);

ALTER TABLE public.echo_sync_continuations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.echo_sync_continuations
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.echo_sync_continuations
  TO service_role;

CREATE OR REPLACE FUNCTION public.dispatch_echo_weekly_sync_continuation(
  p_remaining_npdes_ids text[],
  p_coverage_npdes_ids text[],
  p_failed_npdes_ids text[],
  p_unresolved_npdes_ids text[],
  p_batch_number integer,
  p_root_job_run_id text,
  p_run_tag text,
  p_stale_days integer,
  p_batch_size integer
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batch_size integer := LEAST(GREATEST(COALESCE(p_batch_size, 5), 1), 20);
  v_stale_days integer := GREATEST(COALESCE(p_stale_days, 7), 1);
  v_root_job_run_id text := NULLIF(trim(p_root_job_run_id), '');
  v_request_id bigint;
  v_existing public.echo_sync_continuations%ROWTYPE;
BEGIN
  IF COALESCE(cardinality(p_remaining_npdes_ids), 0) = 0 THEN
    RAISE EXCEPTION 'weekly ECHO continuation requires at least one permit';
  END IF;
  IF v_root_job_run_id IS NULL THEN
    RAISE EXCEPTION 'weekly ECHO continuation requires a root job run id';
  END IF;

  INSERT INTO public.echo_sync_continuations (
    root_job_run_id,
    batch_number,
    remaining_npdes_ids,
    coverage_npdes_ids,
    failed_npdes_ids,
    unresolved_npdes_ids,
    run_tag
  ) VALUES (
    v_root_job_run_id,
    GREATEST(COALESCE(p_batch_number, 2), 2),
    p_remaining_npdes_ids,
    COALESCE(p_coverage_npdes_ids, ARRAY[]::text[]),
    COALESCE(p_failed_npdes_ids, ARRAY[]::text[]),
    COALESCE(p_unresolved_npdes_ids, ARRAY[]::text[]),
    COALESCE(NULLIF(trim(p_run_tag), ''), 'cron-weekly-echo')
  )
  ON CONFLICT (root_job_run_id, batch_number) DO NOTHING;

  IF NOT FOUND THEN
    SELECT *
    INTO v_existing
    FROM public.echo_sync_continuations
    WHERE root_job_run_id = v_root_job_run_id
      AND batch_number = GREATEST(COALESCE(p_batch_number, 2), 2);

    IF v_existing.remaining_npdes_ids IS DISTINCT FROM p_remaining_npdes_ids
      OR v_existing.coverage_npdes_ids IS DISTINCT FROM COALESCE(p_coverage_npdes_ids, ARRAY[]::text[])
      OR v_existing.failed_npdes_ids IS DISTINCT FROM COALESCE(p_failed_npdes_ids, ARRAY[]::text[])
      OR v_existing.unresolved_npdes_ids IS DISTINCT FROM COALESCE(p_unresolved_npdes_ids, ARRAY[]::text[])
    THEN
      RAISE EXCEPTION 'weekly ECHO continuation idempotency collision for root %, batch %',
        v_root_job_run_id,
        GREATEST(COALESCE(p_batch_number, 2), 2);
    END IF;
    IF v_existing.net_request_id IS NULL THEN
      RAISE EXCEPTION 'weekly ECHO continuation root %, batch % has no request id',
        v_root_job_run_id,
        GREATEST(COALESCE(p_batch_number, 2), 2);
    END IF;

    RETURN v_existing.net_request_id;
  END IF;

  v_request_id := dispatch_edge_job(
    'sync-echo-weekly',
    NULL,
    'sync-echo-data',
    jsonb_build_object(
      'sync_type', 'scheduled',
      'stale_days', v_stale_days,
      'stale_only', true,
      'limit', v_batch_size,
      'auto_continue', true,
      'continuation_npdes_ids', to_jsonb(p_remaining_npdes_ids),
      'coverage_npdes_ids', to_jsonb(COALESCE(p_coverage_npdes_ids, ARRAY[]::text[])),
      'prior_failed_npdes_ids', to_jsonb(COALESCE(p_failed_npdes_ids, ARRAY[]::text[])),
      'prior_unresolved_npdes_ids', to_jsonb(COALESCE(p_unresolved_npdes_ids, ARRAY[]::text[])),
      'batch_number', GREATEST(COALESCE(p_batch_number, 2), 2),
      'root_job_run_id', v_root_job_run_id,
      'run_tag', COALESCE(NULLIF(trim(p_run_tag), ''), 'cron-weekly-echo')
    )
  );

  UPDATE public.echo_sync_continuations
  SET net_request_id = v_request_id,
      dispatched_at = now()
  WHERE root_job_run_id = v_root_job_run_id
    AND batch_number = GREATEST(COALESCE(p_batch_number, 2), 2);

  RETURN v_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.dispatch_echo_weekly_sync_continuation(
  text[],
  text[],
  text[],
  text[],
  integer,
  text,
  text,
  integer,
  integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.dispatch_echo_weekly_sync_continuation(
  text[],
  text[],
  text[],
  text[],
  integer,
  text,
  text,
  integer,
  integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.run_echo_weekly_sync_job()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN dispatch_edge_job(
    'sync-echo-weekly',
    NULL,
    'sync-echo-data',
    jsonb_build_object(
      'sync_type', 'scheduled',
      'stale_days', 7,
      'stale_only', true,
      'limit', 5,
      'auto_continue', true,
      'batch_number', 1,
      'run_tag', 'cron-weekly-echo'
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.run_echo_weekly_sync_job()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_echo_weekly_sync_job() TO service_role;
