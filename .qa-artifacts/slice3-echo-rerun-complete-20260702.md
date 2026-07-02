# Slice 3 / Task 3.35 — Full ECHO discrepancy re-run (COMPLETE)

**Captured:** 2026-07-02  
**Org:** `2bffc35c-e2c4-4396-868f-207f80e1e2c4`

## Summary

All **149** distinct `external_echo_facilities` NPDES IDs dispatched via `run_detect_discrepancies_echo_job` with single-permit `target_npdes_ids` scoping. Every run logged to `job_runs` as `detect-discrepancies-echo`.

## Before / after (prod)

| Metric | Before (2026-07-02 AM) | After (full batch) | Δ |
|--------|----------------------:|-------------------:|--:|
| discrepancy_reviews | 149,452 | 181,079 | +31,627 |
| missing_internal | 149,451 | 180,976 | +31,525 |
| status_mismatch | 2 | 103 | +101 |
| value_mismatch | 0 | 0 | 0 |
| external_echo_dmrs | 336,403 | 336,403 | 0 |
| dmr_submissions (SCC) | 1 | 1 | 0 |

## job_runs

| Status | Count (2026-07-02) |
|--------|-------------------:|
| succeeded | 152 |
| failed | 0 |

## Execution

- Script: `npm run qa:slice3-echo-batch-detect` → `scripts/slice3-echo-batch-detect.mjs`
- Full batch: offsets 0–3 (smoke) + offset 4–148 (145 permits, `--wait 3`)
- Detail log: `.qa-artifacts/slice3-echo-batch-detect-20260702.md`

## Interpretation

`missing_internal` **grew** because prior org-wide detect was incomplete (546 timeout); scoped re-run **inserted** missing rows for permits never fully evaluated. Shrinkage toward real internal coverage requires Slice 1 domain data (`dmr_submissions`, permits/limits) — still at 1 SCC submission.

## Known blockers (unchanged)

| Item | Status |
|------|--------|
| WV1024078 DMR sync | NO-GO — EPA effluent API 502/timeout |
| Full org detect (single shot) | NO-GO — use per-permit batching (shipped) |

## Go / no-go

| Check | Verdict |
|-------|---------|
| 149/149 facilities dispatched under job_runs | **GO** |
| Zero failed detect job_runs on 2026-07-02 | **GO** |
| missing_internal shrank vs Feb baseline | **N/A** — detection coverage expanded, not internal data |
| Review Queue usable at volume | **GO** — virtualization + bulk triage shipped (3.43/3.44) |
