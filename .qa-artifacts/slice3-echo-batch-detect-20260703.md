# Slice 3 — batched ECHO discrepancy detect (task 3.35)

**Captured:** 2026-07-03T14:51:39.224Z  
**Org:** `2bffc35c-e2c4-4396-868f-207f80e1e2c4`  
**Batch:** offset=113, limit=1, processed=1 / 149 facilities

## Before / after

| Metric | Before | After | Δ |
|--------|-------:|------:|--:|
| discrepancy_reviews (total) | 181086 | 181086 | +0 |
| missing_internal | 180976 | 180976 | +0 |
| value_mismatch | 0 | 0 | 0 |
| status_mismatch | 110 | 110 | 0 |
| external_echo_dmrs | 336403 | 336403 | 0 |

## job_runs (detect-discrepancies-echo since batch start)

| Metric | Count |
|--------|------:|
| succeeded | 1 |
| failed | 0 |
| rows_affected (sum) | 0 |



## Per-permit dispatch

| NPDES | OK | ms | detail |
|-------|:--:|---:|--------|
| WV1018736 | ✓ | 53 | req 38634 |

## Remaining

35 permits not processed in this window. Resume with `--resume` or `--offset 114`.

## Notes

- Scoped detect dedupes via `batch_insert_discrepancies`; safe to re-run permits.
- `missing_internal` shrinks materially only as internal `dmr_submissions` / permit data grows (Slice 1).
- WV1024078 DMR sync remains upstream-blocked (EPA 502) per prior slice3 artifact.
