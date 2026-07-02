# Slice 3 — ECHO discrepancy re-run

**Captured:** 2026-07-02  
**Org:** `2bffc35c-e2c4-4396-868f-207f80e1e2c4`

## Before

| Metric | Count |
|--------|------:|
| external_echo_dmrs | 336,403 |
| WV1024078 DMR rows | 0 |
| discrepancy_reviews | 146,019 |
| missing_internal | 146,019 |
| SCC dmr_submissions | 1 |

## Actions (prod)

| Step | Result |
|------|--------|
| Vault auth fix (`cron_internal_secret` + service role) | GO — sync/detect auth 200 |
| WV1024078 sync (`dmr_only`, chunk 0) | NO-GO — EPA effluent API 502/timeout |
| Full detect (all org, 336K DMRs) | NO-GO — edge 546 @ 57s (worker limit) |
| Scoped detect (`KYGE40869`) | GO — 3,433 inserted in 1.7s |

## After

| Metric | Count | Δ |
|--------|------:|--:|
| external_echo_dmrs | 336,403 | 0 |
| WV1024078 DMR rows | 0 | 0 |
| discrepancy_reviews | 149,452 | +3,433 |
| missing_internal | 149,451 | +3,432 |
| KYGE40869 reviews | 3,433 | +3,433 |

## Root causes

1. **WV1024078:** EPA `get_effluent_chart` returns HTTP 502 after ~120s even for 1-month windows. Facility row exists; DMR data is upstream-blocked.
2. **Full org detect:** Single invocation scans 336K+ external DMRs — exceeds Supabase Edge worker memory/time (546). Fix: batched detect via `target_npdes_ids` (shipped v55).

## Go / no-go

| Check | Verdict |
|-------|---------|
| job_runs wrappers + vault auth | **GO** |
| CMS Rule 3 detect path (scoped) | **GO** |
| WV1024078 DMR sync | **NO-GO** (EPA upstream) |
| Full org detect in one shot | **NO-GO** — use per-permit batching |

## Next

- Batch full re-run: loop `run_detect_discrepancies_echo_job(org, ARRAY[npdes_id])` over ~159 eligible permits
- WV1024078: retry off-peak or escalate to EPA ECHO support; facility-only sync is OK
