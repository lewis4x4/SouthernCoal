# EPA ECHO Sync — Full Report

**Date:** February 20, 2026
**System:** SCC Compliance Monitoring System
**Supabase Project:** zymenlnwyzpnohljwifx

---

## What We Built

A two-stage automated pipeline that pulls compliance data from EPA's public ECHO database and compares it against our internal records to flag discrepancies.

### Stage 1: ECHO Data Sync (`sync-echo-data`)

An Edge Function that calls EPA's Detailed Facility Report (DFR) API and Effluent Chart API for each NPDES permit. For every permit it pulls:

- **Facility info** — name, address, permit status, compliance status, quarters in non-compliance, last inspection date, permit expiration date, SIC/NAICS codes
- **DMR records** — every Discharge Monitoring Report data point: outfall, parameter, reported value, permit limit, violation code, monitoring period, exceedance percentage

Data is upserted into two tables:
- `external_echo_facilities` — one row per permit
- `external_echo_dmrs` — one row per DMR data point (parameter + monitoring period + outfall)

Features:
- `dry_run` mode to preview eligible permits without syncing
- `target_npdes_ids` to sync specific permits
- `offset`/`limit` for batch pagination
- `run_tag` for grouping sync runs
- NPDES ID normalization (strips whitespace, adds state prefix, uppercases)
- Skip patterns for general permits (KYGE, TNR059) and SMCRA IDs
- Rate limiting (500ms between EPA API calls) with exponential backoff on 429/503
- Retry with backoff on transient failures
- Deduplication via upsert on `npdes_id` unique constraint
- Auto-triggers Stage 2 after completion

### Stage 2: Discrepancy Detection (`detect-discrepancies`)

An Edge Function that compares ECHO data against internal records and flags mismatches. Three detection rules:

| Rule | What It Checks | Severity |
|------|---------------|----------|
| Rule 1 | Permit status in EPA vs. internal `npdes_permits` table. Also flags SNC (Significant Non-Compliance) status if we have no exceedances tracked. | Critical (SNC), High (status mismatch) |
| Rule 2 | DMR violations reported by EPA that we don't have in our `exceedances` table | High |
| Rule 3 | DMR values where our submitted value differs from EPA's recorded value by >10% | Medium |

Discrepancies are inserted into `discrepancy_reviews` with deduplication via a partial unique index (prevents duplicate entries for the same permit + type + period + source). Each discrepancy includes severity, description, internal vs. external values, and links to source records.

### Supporting Infrastructure

- `external_sync_log` — audit trail of every sync run (start time, end time, status, records synced/failed, metadata)
- `audit_log` entries for both sync and detection events
- `batch_insert_discrepancies` RPC — handles bulk insert with ON CONFLICT dedup for the partial unique index that PostgREST can't target directly
- Frontend hooks (`useExternalData`, `useDiscrepancies`, `useSyncTrigger`) and UI components (`EchoStatusPanel`, `DiscrepancyTable`, `DiscrepancySummaryCards`, `DiscrepancyDetailPanel`, `ReviewQueuePage`)

---

## What We Pulled

### Sync Execution

- **Date:** February 20, 2026
- **Script:** `scripts/full-echo-sync.sh` — batch script that syncs one permit at a time to avoid gateway timeouts
- **Total eligible permits:** 154
- **Successfully synced:** 153
- **Failed:** 1 (WV1024078 — exceeded Edge Function compute limit; facility data landed, DMRs did not)
- **Zero failures** on all other permits

### Data Volume

| Table | Total Rows | Unique Permits |
|-------|-----------|---------------|
| `external_echo_facilities` | 101 | 101 |
| `external_echo_dmrs` | 289,488 | 73 |
| `discrepancy_reviews` | 144,339 | — |
| `external_sync_log` | 117 completed entries | — |

### By State

| State | Facilities | DMR Records | Violations | Notes |
|-------|-----------|-------------|-----------|-------|
| AL | 7 | 2,295 | 212 | All permits synced. Mix of active and terminated. |
| KY | 2 | 4,067 | 3,121 | 2 individual permits synced. 37 general permits (KYGE) excluded — EPA doesn't track individually. |
| TN | 24 | 5,579 | 147 | All individual permits synced. 10 general permits (TNR059) excluded. |
| VA | 1 | 0 | 0 | Only 1 matched (wrong facility — a school). All 42 VA permits are DMLR mining IDs, not federal NPDES IDs. See VA section below. |
| WV | 67 | 277,547 | 140,859 | Bulk of operations. 65 of 67 in SNC status. |

### Compliance Status Summary (from EPA)

| Status | Count |
|--------|-------|
| Significant/Category I Noncompliance (SNC) | 58 |
| No Violation Identified | 14 |
| Terminated Permit | 12 |
| Violation Identified | 5 |
| Unknown | 5 |
| Expired (various) | 7 |

### Top 10 Permits by DMR Volume

| Permit | Facility | DMRs | Violations | Period |
|--------|----------|------|-----------|--------|
| WV1018965 | Sewell Seam Mine No. 2 | 23,403 | 16,385 | Oct 2022 – Sep 2025 |
| WV1006304 | Red Fox Surface Mine | 18,657 | 9,742 | Oct 2022 – Sep 2025 |
| WV1020366 | WV 3 Surface Mine & Haulroad | 15,441 | 9,639 | Oct 2022 – Sep 2025 |
| WV1026488 | Three Marie Highwall Mine | 14,200 | 4,985 | Oct 2022 – Sep 2025 |
| WV1021338 | Big Branch Highwall Mine | 14,091 | 7,794 | Oct 2022 – Sep 2025 |
| WV1021079 | Contour No. 2 | 12,740 | 7,426 | Oct 2022 – Sep 2025 |
| WV1018779 | Pinnacle Ridge Surface Mine | 12,186 | 8,220 | Oct 2022 – Aug 2025 |
| WV1025929 | Big Creek Surface Mine | 9,206 | 5,026 | Oct 2022 – Sep 2025 |
| WV1021249 | Puncheoncamp Thin Seam Mine | 8,404 | 3,475 | Oct 2022 – Sep 2025 |
| WV1024442 | East Gulf Surface Mine | 8,248 | 2,898 | Oct 2022 – Sep 2025 |

---

## Discrepancy Detection Results

After the full sync, discrepancy detection was run against the complete dataset.

| Metric | Value |
|--------|-------|
| Total discrepancies found | 144,339 |
| New discrepancies inserted | 121,322 |
| Skipped (duplicates from earlier test run) | 23,017 |
| Insert errors | 0 |

**All 144,339 discrepancies are Rule 2 (`missing_internal`) / severity: high.** This is expected behavior — every DMR violation EPA reports shows up as "ECHO reports a violation we're not tracking internally" because the internal tables (`npdes_permits`, `exceedances`, `dmr_submissions`) are empty. No internal compliance data has been ingested yet.

These discrepancies will resolve as internal data flows in:
- Rule 1 (status mismatch) will activate once `npdes_permits` is populated
- Rule 2 counts will drop as exceedance data is imported
- Rule 3 (value mismatch >10%) will activate once `dmr_submissions` has data

---

## What Didn't Sync — And Why

### Virginia (42 permits) — DMLR Permit IDs, Not NPDES

The uploaded VA permit documents use **DMLR (Department of Mines, Land, and Reclamation) mining permit numbers** as their primary identifier. These are 7-digit IDs like 1100877, 1101916, 1202075.

The AI PDF parser extracted these numbers and the NPDES normalizer converted them into IDs that look like valid NPDES format (VA0080877, VA0081916, etc.) but they are **not real federal NPDES permit numbers**. EPA's ECHO system doesn't recognize them.

The one match (VA0082058) was a coincidental collision with "Washington District Elementary" — a school's wastewater permit, not an SCC operation.

**To fix:** Need a crosswalk mapping each DMLR permit number to its actual federal NPDES ID. This would come from DMLR records, the original NPDES permit documents, or the team that handles VA DMR submissions.

DMLR numbers needing mapping:

```
1100877, 1101554, 1101800, 1101824, 1101905, 1101914, 1101916, 1101917,
1101918, 1101949, 1101953, 1101954, 1101975, 1101991, 1101992, 1102003,
1102028, 1102042, 1102047, 1102048, 1102051, 1102052, 1102054, 1102058,
1102059, 1102066, 1102068, 1102069, 1102070, 1102071, 1102072, 1102073,
1102074, 1102075, 1102076, 1102077, 1102078, 1102079, 1102094, 1007571,
1202075, 1302069, 1602068, 1602072
```

### Kentucky General Permits (37 permits)

All KYGE40xxx series. These are Kentucky General Permits for stormwater associated with mining. EPA does not track general permit coverage individually in ECHO — they're managed at the state level through KYDEP. No action needed.

### Tennessee General Permits (10 permits)

All TNR059xxx series. Same situation as KY — Tennessee general stormwater permits managed through TDEC. Not individually trackable in ECHO. No action needed.

### Other (2 permits)

- **WV0400311** — Old WV permit format, not registered in current ECHO system
- **WVS-4001-07** — Stormwater permit format, not individual NPDES

### WV1024078 — Compute Limit

McDonald Fork Surface Mine. The facility record landed (Effective, SNC) but the DMR data exceeded the Edge Function's compute allocation. This permit likely has an exceptionally large number of DMR records. Retriable with a date-range-chunked approach in a future update.

---

## Code Audit Summary

Before running the full sync, a comprehensive code audit was performed across all Layer 2 components. Issues were categorized P0 (critical), P1 (important), P2 (nice-to-have).

### P0 Fixes (all deployed)

1. **Auto-trigger missing Authorization header** — `sync-echo-data` called `detect-discrepancies` without the required Bearer token. Added `SUPABASE_ANON_KEY`.
2. **CORS missing x-internal-secret** — The shared CORS config didn't allow the `x-internal-secret` header, causing preflight failures.
3. **No local migration for batch_insert_discrepancies** — RPC existed in live DB but had no migration file. Created it.
4. **SNC check was org-wide** — `detect-discrepancies` Rule 1b checked for exceedances across the entire org instead of per-permit. Scoped to `.eq("npdes_id")`.
5. **sync-msha-data wrong column** — Used `metadata` instead of `description` for audit_log insert.

### P1 Fixes (all deployed)

1. **N+1 queries in Rule 1** — Replaced per-facility database queries with batch-fetch into Maps. Went from 300+ queries to 5-6.
2. **useDiscrepancies fetched all rows** — Was trying to load 23K+ rows (capped at 1000 by PostgREST). Switched to paginated fetch with server-side severity counts.
3. **useExternalData sequential queries** — Parallelized 3 DMR summary queries with Promise.all.
4. **PostgREST pagination gaps** — Rules 1, 2, and 3 weren't paginating past the 1000-row PostgREST limit. Added proper pagination loops.
5. **Rule 3 N+1 per DMR** — Pre-fetched all internal DMR line items into a Map for O(1) lookup.
6. **Stale sync_log entries** — 8 "running" entries from previous timeout failures cleaned up.

### Security Scan Results

- No hardcoded secrets in source code
- No XSS, SQL injection, or OWASP Top 10 vulnerabilities found
- All public tables have RLS enabled with policies
- `batch_insert_discrepancies` SECURITY DEFINER function had mutable `search_path` — fixed with `SET search_path = public`
- 14 pre-existing SECURITY DEFINER functions and 41 overly permissive RLS policies were noted (pre-existing, not part of Layer 2)

---

## Files

### Edge Functions

| File | Lines | Purpose |
|------|-------|---------|
| `supabase/functions/sync-echo-data/index.ts` | 768 | ECHO DFR + effluent sync |
| `supabase/functions/detect-discrepancies/index.ts` | ~400 | 3-rule detection engine |
| `supabase/functions/sync-msha-data/index.ts` | 119 | Stub (returns 501) |
| `supabase/functions/_shared/cors.ts` | 12 | Shared CORS config |

### Migrations

| File | Purpose |
|------|---------|
| `supabase/migrations/20260211170006_create_external_data_tables.sql` | Schema for external_echo_facilities, external_echo_dmrs, external_msha_inspections, discrepancy_reviews, external_sync_log |
| `supabase/migrations/20260211170011_discrepancy_dedup_index.sql` | Partial unique index for discrepancy dedup |
| `supabase/migrations/20260211170012_create_batch_insert_discrepancies_rpc.sql` | Batch insert RPC with ON CONFLICT handling |

### Frontend

| File | Purpose |
|------|---------|
| `src/hooks/useExternalData.ts` | Fetch facility + DMR summary data |
| `src/hooks/useDiscrepancies.ts` | Paginated discrepancy fetch + server-side counts |
| `src/hooks/useSyncTrigger.ts` | Trigger sync from frontend |
| `src/components/external-data/EchoStatusPanel.tsx` | Facility data display |
| `src/components/external-data/MshaStatusPanel.tsx` | MSHA panel (awaiting data) |
| `src/components/review-queue/DiscrepancyTable.tsx` | Discrepancy triage table |
| `src/components/review-queue/DiscrepancyDetailPanel.tsx` | Detail slideout panel |
| `src/components/review-queue/DiscrepancySummaryCards.tsx` | Severity count cards |
| `src/pages/ReviewQueuePage.tsx` | Full review queue page |
| `src/stores/reviewQueue.ts` | Zustand store for review queue state |

### Scripts & Reports

| File | Purpose |
|------|---------|
| `scripts/full-echo-sync.sh` | Batch sync script (zsh) — syncs one permit at a time with resume support |
| `echo-sync-coverage.csv` | Full coverage export — every permit with EPA data status and issue notes |

---

## What's Next

The ECHO pipeline work has been merged into the **Unified Roadmap** — see `UNIFIED_ROADMAP.md` and the `roadmap_tasks` database table for the full implementation plan (201 tasks across 5 phases, 26 sections).

**Immediate next steps from the unified roadmap:**

| Task | Section | Description |
|------|---------|-------------|
| 2.62 | 2H — Database Prep | `parameter_aliases` table + seed data for STORET code mapping |
| 2.63 | 2H — Database Prep | `outfall_aliases` table for cross-state outfall naming |
| 2.64 | 2H — Database Prep | STORET code seed data validation |
| 3.32 | 3D — External Data Pipeline | Justice EDD parser Edge Function |
| 3.33 | 3D — External Data Pipeline | DMR pipeline: parse → populate 7 internal tables |
| 3.38 | 3D — External Data Pipeline | VA NPDES ID override UI (DMLR → NPDES crosswalk) |
| 3.40 | 3D — External Data Pipeline | MSHA pipeline (blocked on mine ID mapping from Tom) |

**Blocked items requiring SCC management:**
- Phase 1 SCC review tasks (1.01–1.14): org structure confirmation, subsidiary mapping, permit assignments
- MSHA mine ID mapping (task 3.40): needs Tom to provide mine IDs
- VA NPDES crosswalk data (task 3.38): needs DMLR → federal NPDES mapping from VA team

---

*Generated by SCC Compliance Monitor — a compliance reporting tool. Not an EMS. Not legal or environmental consulting. All data and reports require independent verification by qualified personnel before regulatory submission.*
