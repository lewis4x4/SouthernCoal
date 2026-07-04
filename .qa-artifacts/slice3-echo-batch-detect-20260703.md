# Slice 3 — batched ECHO discrepancy detect (task 3.35)

**Captured:** 2026-07-03T21:20:45.379Z
**Org:** `2bffc35c-e2c4-4396-868f-207f80e1e2c4`
**Batch:** offset=129, limit=1, processed=1 / 149 facilities

## Before / after

| Metric | Before | After | Δ |
|--------|-------:|------:|--:|
| discrepancy_reviews (total) | 181633 | 181633 | +0 |
| missing_internal | 181517 | 181517 | +0 |
| value_mismatch | 0 | 0 | 0 |
| status_mismatch | 116 | 116 | 0 |
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
| WV1022652 | ✓ | 47 | req 38724 |

## Remaining

19 permits not processed in this window. Resume with `--resume` or `--offset 130`.

## Notes

- Scoped detect dedupes via `batch_insert_discrepancies`; safe to re-run permits.
- `missing_internal` shrinks materially only as internal `dmr_submissions` / permit data grows (Slice 1).
- WV1024078 DMR sync remains upstream-blocked (EPA 502) per prior slice3 artifact.
