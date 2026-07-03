# Slice 3 — batched ECHO discrepancy detect (task 3.35)

**Captured:** 2026-07-03T15:27:00.410Z
**Org:** `2bffc35c-e2c4-4396-868f-207f80e1e2c4`
**Batch:** offset=131, limit=1, processed=1 / 149 facilities

## Before / after

| Metric | Before | After | Δ |
|--------|-------:|------:|--:|
| discrepancy_reviews (total) | 181629 | 181629 | +0 |
| missing_internal | 181517 | 181517 | +0 |
| value_mismatch | 0 | 0 | 0 |
| status_mismatch | 112 | 112 | 0 |
| external_echo_dmrs | 337416 | 337416 | 0 |

## job_runs (detect-discrepancies-echo since batch start)

| Metric | Count |
|--------|------:|
| succeeded | 1 |
| failed | 0 |
| rows_affected (sum) | 0 |



## Per-permit dispatch

| NPDES | OK | ms | detail |
|-------|:--:|---:|--------|
| WV1024078 | ✓ | 62 | req 38645 |

## Remaining

17 permits not processed in this window. Resume with `--resume` or `--offset 132`.

## Notes

- Scoped detect dedupes via `batch_insert_discrepancies`; safe to re-run permits.
- `missing_internal` shrinks materially only as internal `dmr_submissions` / permit data grows (Slice 1).
- WV1024078 broad effluent pulls remain timeout-prone, but the parameter-sliced sync path is live; `.qa-artifacts/slice3-wv1024078-sync-20260703.md` inserted 1,013 DMR rows with 0 parameter failures before this scoped detect.
