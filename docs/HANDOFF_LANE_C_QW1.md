# Lane C QW1 Handoff: Missed-Sampling / Calendar-Gap Detector

## Status

QW1 is implemented as real code: nightly `pg_cron` runs `run_sampling_gap_detection_for_all_orgs()`, each org scan generates the active sampling-calendar window from loaded schedules, opens missed/at-risk `sampling_gap_records`, and creates a coupled `work_orders` row in the same transaction.

The UI at `/compliance/missed-at-risk` renders explicit states:
- `Not configured` when no Sampling Matrix/schedules/calendar rows exist.
- `Calendar empty` when schedules exist but calendar rows have not generated yet.
- `Draft calendar` when only manual/synthetic schedules exist.
- `Configured` once `sampling_schedules.source = 'matrix_upload'` rows exist.

## Deploy

```bash
supabase db push
npm run qa:qw1
npm run typecheck
npm run build
```

## Staging Check

```bash
psql "$SUPABASE_DB_URL" -f scripts/seed-qw1-uat-calendar.sql
npm run qa:qw1
```

Manual staging:
- Open `/compliance/missed-at-risk` as `wv-uat-admin@invalid.scc.local`.
- Before seeding, confirm `Not configured`.
- After seeding, confirm `Draft calendar`, run detection, and verify one missed plus one at-risk row.
- Confirm each opened gap has `work_order_id`, `audit_log` start/complete rows, and a `work_order_events` timeline entry.
- Resolve a gap and verify `valid_to` plus a completed coupled work order event.

## Remaining Manual Task

Sampling Matrix Q14 is still the data unlock. Importing it through Upload Dashboard creates `sampling_schedules.source = 'matrix_upload'`; the nightly job will then generate the active calendar window and move the QW1 UI from draft/empty into configured mode.
