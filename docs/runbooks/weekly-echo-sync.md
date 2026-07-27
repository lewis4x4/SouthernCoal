# Weekly ECHO sync operator runbook

The Sunday `04:00 UTC` job processes five stale permits at a time. Each batch
creates its own `job_runs` entry and dispatches the exact remaining permit IDs
to the next batch. The final batch fails visibly if coverage still contains
failed or unresolved permits.

## Deploy

```bash
supabase db push
supabase functions deploy sync-echo-data
supabase migration list
supabase functions list
```

Before triggering the job, confirm the Vault secrets `cron_service_role_key`
and `cron_internal_secret` exist. `cron_internal_secret` must match the
`EMBEDDING_INTERNAL_SECRET` Edge Function secret. Do not print secret values.

## Trigger and monitor

Run in the Supabase SQL editor:

```sql
SELECT public.run_echo_weekly_sync_job();
```

Monitor the batch ledger and persisted coverage:

```sql
SELECT id, status, started_at, finished_at, rows_scanned, rows_affected, error_detail
FROM public.job_runs
WHERE job_name = 'sync-echo-weekly'
ORDER BY started_at DESC
LIMIT 20;

SELECT
  id,
  status,
  completed_at,
  metadata->>'run_tag' AS run_tag,
  metadata->'coverage' AS coverage
FROM public.external_sync_log
WHERE source = 'echo_facility'
  AND metadata->>'run_tag' IN ('cron-weekly-echo', 'operator-weekly-echo-resume')
ORDER BY created_at DESC
LIMIT 20;

SELECT root_job_run_id, batch_number, net_request_id, remaining_npdes_ids, dispatched_at
FROM public.echo_sync_continuations
ORDER BY created_at DESC
LIMIT 20;
```

The drain is complete when the newest coverage object has
`"coverage_complete": true`, `"remaining_count": 0`, and the newest
`sync-echo-weekly` job is `succeeded`. Any IDs in `remaining_npdes_ids` are the
exact permits requiring another attempt or data repair.

## Resume remaining permits

Replace the example IDs with `remaining_npdes_ids` from the coverage result:

```sql
SELECT public.dispatch_echo_weekly_sync_continuation(
  ARRAY['WV0000001', 'WV0000002']::text[],
  ARRAY['WV0000001', 'WV0000002']::text[],
  ARRAY[]::text[],
  ARRAY[]::text[],
  2,
  gen_random_uuid()::text,
  'operator-weekly-echo-resume',
  7,
  5
);
```

The resume call uses the same five-permit batching, retry behavior, continuation
chain, RBAC boundary, `external_sync_log`, `audit_log`, and `job_runs` closeout
as the scheduled job.
