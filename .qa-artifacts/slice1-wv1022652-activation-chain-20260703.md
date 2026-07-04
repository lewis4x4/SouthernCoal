# Slice 1 phase 3 - WV1022652 activation chain

**Started:** 2026-07-03T21:17:39.264Z
**Finished:** 2026-07-03T21:20:45.379Z
**Org:** `2bffc35c-e2c4-4396-868f-207f80e1e2c4`
**Status:** complete - permit cleared from the missing-limit gap list

## Acceptance checks

| Check | Result |
|-------|--------|
| Permit-limit propagation | Inserted 36 `permit_limits` for `WV1022652` |
| `has_permit_limit` increased | 2974 -> 3010 (Delta +36) |
| Mirror keys increased | 15753 -> 15809 (Delta +56) |
| Pending `missing_internal` dropped | 143719 -> 143551 (Delta -168) |
| `WV1022652` gap-list rank | #1 with 36 keys -> off top-25 |
| Scoped ECHO detect | Retry succeeded; job `f1487b72-cc5b-41f2-a520-5be8eba6dd84`, rows_affected 0 |

## Funnel before -> after

| Stage | Before | After | Delta |
|-------|-------:|------:|------:|
| Violation keys | 13312 | 13312 | 0 |
| No registry permit | 4383 | 4383 | 0 |
| Has permit | 8929 | 8929 | 0 |
| Has outfall | 4372 | 4372 | 0 |
| Has parameter | 3449 | 3449 | 0 |
| Has permit_limit | 2974 | 3010 | +36 |
| `slice1_echo_mirror_keys` | 15753 | 15809 | +56 |
| SYNTHETIC ECHO limits | 829 | 865 | +36 |
| Pending `missing_internal` | 143719 | 143551 | -168 |

## Commands run

```bash
npm run qa:slice1-activation-gaps -- --suffix before
npm run qa:slice1-seed-propagated-limits -- --permit WV1022652 --limit 100 --batches 3
npm run qa:slice1-seed-exceedances -- --limit 50 --batches 20 --permit WV1022652
npm run qa:slice1-repair-stuck-keys -- --limit 50 --batches 10 --permit WV1022652
npm run qa:slice1-reconcile -- --limit 10000 --batches 10
npm run qa:slice1-activation-gaps -- --suffix after
npm run qa:slice3-echo-batch-detect -- --permit WV1022652 --wait 20
npm run qa:slice3-echo-batch-detect -- --permit WV1022652 --wait 30
```

## Step evidence

| Step | Evidence |
|------|----------|
| Before snapshot | `.qa-artifacts/slice1-activation-gaps-20260703-before.md` |
| Propagate permit limits | `.qa-artifacts/slice1-propagate-limit-backfill-20260703.md`: batch 1 inserted 36, batch 2 inserted 0; missing keys 36 -> cleared |
| Seed exceedances | `.qa-artifacts/slice1-exceedance-seed-20260703.md`: seeded 50 + 6 + 0, exceedances 17826 -> 17882 |
| Repair stuck keys | Batch 1 returned `mirror_keys_inserted: 0`, `repaired_lab_results: 0` |
| Reconcile | `.qa-artifacts/slice1-reconcile-20260703.md`: resolved 168 pending `missing_internal` rows |
| After snapshot | `.qa-artifacts/slice1-activation-gaps-20260703-after.md` |
| Scoped detect | `.qa-artifacts/slice3-echo-batch-detect-20260703.md`: request 38724, 1 succeeded, 0 failed, rows_affected sum 0 |

## Scoped detect retry note

The first scoped detect dispatch for `WV1022652` created job
`cbdc14c3-4a5c-4157-b634-bf83c452a43d` and failed with upstream
`HTTP 502 Bad Gateway` at 2026-07-03T21:20:00.016871Z. A bounded retry
completed successfully:

```json
{
  "id": "f1487b72-cc5b-41f2-a520-5be8eba6dd84",
  "status": "succeeded",
  "rows_affected": 0,
  "error_detail": null,
  "started_at": "2026-07-03T21:20:14.805391+00:00",
  "finished_at": "2026-07-03T21:20:18.404659+00:00"
}
```

## Final top gap list

`WV1022652` is no longer present in the top missing-limit permits. The next
permit to attack is `WV1025929`, now rank #1 with 35 missing-limit keys.
