# Slice 5 — Compliance Dashboard Snapshot Validation

**Date:** 2026-07-02  
**Org:** Southern Coal Corporation (`2bffc35c-e2c4-4396-868f-207f80e1e2c4`)  
**Route:** `/compliance/dashboard` (reads `compliance_snapshots` via `useComplianceSnapshots`)

## Migrations applied (prod)

| Migration | Purpose |
|-----------|---------|
| `slice5_compliance_snapshot_cron` | Daily cron + `run_compliance_snapshot_daily_job()` + `get_job_health` entry |
| `slice5_compliance_snapshot_auth_fix` | Allow cron when `get_user_org_id()` is NULL |
| `slice5_compliance_snapshot_cms_schema` | CMS column paths (partial — legacy branches blocked parse) |
| `slice5_compliance_snapshot_states_fix` | Attempted states join (CASE parse issue) |
| `slice5_compliance_snapshot_cms_final` | **Production function** — CMS-only columns |

## Prod execution

```sql
SELECT public.run_compliance_snapshot_daily_job();
-- orgs_processed: 28
```

**job_runs:** `generate-compliance-snapshot-daily` → `succeeded`, `rows_affected: 28`  
**cron:** `30 6 * * *` → `run_compliance_snapshot_daily_job()`

## Before / after

| Metric | Before | After |
|--------|-------:|------:|
| compliance_snapshots (SCC) | 0 | 1 |
| daily snapshot date | — | 2026-07-02 |

## Snapshot vs raw SQL (SCC)

| Field | Snapshot | Raw SQL | Match |
|-------|----------|---------|-------|
| total_permits | 141 | 141 | ✓ |
| active_permits | 141 | 141 | ✓ |
| total_outfalls | 823 | 823 | ✓ |
| active_outfalls | 823 | 823 | ✓ |
| dmr_submissions_due | 0 | 0 (Q3 filter; only DMR is Q1 draft) | ✓ |
| compliance_score | 100.00 | — | plausible (no open gaps in window) |
| state_breakdown | null | 0 sites for org | expected |

## CMS schema fixes shipped

- DMR: `reporting_period_start` (not `period_start`)
- Sampling: `sample_date` + status `results_received`
- Corrective actions: `closed_date` (not `closed_at`)
- States: `sites.state_id` → `states.code` (null breakdown when org has 0 sites)

## Notes

- `system_health_snapshots` not referenced (table does not exist).
- UI (`ComplianceDashboardPage`, `useComplianceSnapshots`) unchanged — already correct.
- Repo migration `20260703050400_slice5_compliance_snapshot_cms_final.sql` is canonical prod function.
