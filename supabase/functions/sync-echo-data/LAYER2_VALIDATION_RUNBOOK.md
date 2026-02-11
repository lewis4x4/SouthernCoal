# Layer 2 Validation Runbook

This runbook matches the hardening behavior implemented in:

- `supabase/functions/sync-echo-data/index.ts`
- `supabase/functions/detect-discrepancies/index.ts`

## Phase 0: Preconditions and Baseline

Verify migrations are applied:

- `supabase/migrations/20260211170009_audit_log_discrepancy_resolved.sql`
- `supabase/migrations/20260211170011_discrepancy_dedup_index.sql`

Capture baseline counts:

```sql
select 'external_echo_facilities' as table_name, count(*) as row_count from external_echo_facilities
union all
select 'external_echo_dmrs', count(*) from external_echo_dmrs
union all
select 'external_sync_log', count(*) from external_sync_log
union all
select 'discrepancy_reviews', count(*) from discrepancy_reviews;
```

Capture one sample response shape (non-destructive):

- Run a dry-run sync with a known permit.
- Run a real sync with `limit=1`.
- Save key logs for:
  - DFR parser selection behavior
  - DMR empty-response keys (`topKeys`, `resultKeys`)

## Deterministic Validation Calls

Dry-run selection preview:

```json
{
  "sync_type": "validation",
  "dry_run": true,
  "run_tag": "layer2-validation-a",
  "target_npdes_ids": ["AL0062693", "KY0094510", "TN0043222", "VA0081742", "WV0065048"]
}
```

Deterministic 5-permit validation:

```json
{
  "sync_type": "validation",
  "dry_run": false,
  "run_tag": "layer2-validation-a",
  "target_npdes_ids": ["AL0062693", "KY0094510", "TN0043222", "VA0081742", "WV0065048"]
}
```

Broader batch:

```json
{
  "sync_type": "validation",
  "dry_run": false,
  "run_tag": "layer2-validation-b",
  "limit": 20,
  "offset": 0
}
```

Full run:

```json
{
  "sync_type": "full",
  "dry_run": false,
  "run_tag": "layer2-validation-full"
}
```

## Post-Run Validation

Inspect latest sync metadata:

```sql
select
  id,
  status,
  started_at,
  completed_at,
  records_synced,
  records_failed,
  metadata
from external_sync_log
order by started_at desc
limit 5;
```

Run discrepancy detection twice and compare:

- First run should insert new pending rows.
- Second run should show mostly `skipped_duplicates`.

## Cleanup Policy

- Never use broad time-window deletes in production.
- Only cleanup by explicit `run_tag` / known run IDs.
- Prefer retention of sync and discrepancy history for auditability.

