# Handoff — Internal Data Activation + ECHO Reconciliation Loop

**Version:** 1.0 · **Date:** 2026-07-01
**Authority:** `docs/ENGINEERING_FREEDOM.md` (build autonomously; stop only at the hard gates in §5 below) · **Sequencing:** `docs/UNIFIED_MASTER_ROADMAP.md` (this phase implements §6 remainder + §7.2 rules 4–5) · **Repo:** `SouthernCoal` @ `main`
**Fact-check status:** every anchor in this document was verified against the repo at main tip (`f6ed9ee`) on 2026-07-01. Live-DB counts could not be re-verified this session (Supabase MCP unauthorized); figures marked *(Feb 2026)* are from `ECHO_SYNC_REPORT.md` and must be re-measured in Slice 3 step 0.

**Goal:** turn the platform from "upload/parse works" into "internal records exist, ECHO discrepancies mean something, and humans can triage them at scale" — entirely internal draft/review tooling, zero external submits.

---

## 1. Why this phase

The ECHO investment is structurally idle: **289,488** external DMR rows and **144,339** discrepancy rows *(Feb 2026)* — **100% `missing_internal`, all severity high** — because the internal tables the detection rules read (`npdes_permits` for Rule 1, `exceedances` for Rule 2, `dmr_submissions` for Rule 3) were empty by design when detection ran. The Upload Dashboard import paths now exist end-to-end. This phase closes the loop.

**Table names (get these right):** `external_echo_dmrs`, `external_echo_facilities`, `discrepancy_reviews` (NOT "discrepancies"), `external_sync_log`. Discrepancy types: `missing_internal` / `missing_external` / `value_mismatch` / `status_mismatch`.

---

## 2. Build order — seven slices

### Slice 0 — §7.2 rules 4+5: job-run ledger + alert acknowledgment (foundation — build first)

Confirmed absent from all migrations at main tip. The Slice-3 re-run over 144k+ rows is the first consumer: it must not be a silent-failure job.

- **`job_runs`** (append-only, bitemporal per §7.2 r2, RLS org-scoped; nullable `org_id` for global jobs): `job_name`, `started_at`, `finished_at`, `status` CHECK (`running`/`succeeded`/`failed`), `rows_scanned`, `rows_affected`, `error_detail`. Helpers `begin_job_run(job_name)` / `complete_job_run(...)` (SECURITY DEFINER). Wrap every scheduled entrypoint (`run_sampling_gap_detection_for_all_orgs`, penalty-ledger refresh, MSHA abatement, ECHO weekly sync, exceedance digest, precip sync) in `BEGIN … EXCEPTION WHEN OTHERS` → failed run row + `audit_log` entry. `get_job_health()` RPC (last run per job, cadence staleness, stale `running` rows flagged presumed-failed) surfaced on the nearest existing admin page.
- **`alert_acknowledgments`** (append-only, RLS org-scoped): `alert_type` CHECK (`msha_abatement`/`edd_paragraph49`/`sampling_gap`/`exceedance_digest`), `alert_ref_id`, `acknowledged_by` → `user_profiles`, `acknowledged_at`, `channel`, `note`. RPC `acknowledge_alert(...)` (+ audit entry); `get_unacknowledged_statutory_alerts()` joining `get_msha_abatement_at_risk`, flagged ¶49 rows, open gap rows, minus acks. Ack buttons on the three existing surfaces. **Ack ≠ dismiss** — dismissal stays in existing review-status flows; no auto-ack anywhere.
- Test pattern: clone `src/lib/__tests__/equipmentMaintenanceMigration.test.ts`; include a forced-failure path.
- **Out of scope:** escalate-on-silence paging (needs the notification-rota design — later phase).

### Slice 1 — Domain data activation

Populate `npdes_permits` / `outfalls` / `permit_limits` / `lab_results` / `dmr_submissions` via the existing import paths (`parse-permit-pdf` + Approve & Import, `import-permit-limits`, `parse-parameter-sheet`, `import-lab-data`, `parse-netdmr-bundle` + `import-netdmr-dmr`), using UAT/synthetic fixtures where real files are absent (label synthetic seed clearly, per ENGINEERING_FREEDOM). `get_upload_dashboard_domain_stats` already exists (migration `20260702210000`) — Summary stat cards must match raw SQL counts.

### Slice 2 — Lab → DMR calculation loop (hardening, not greenfield)

The full code path already exists: `import-lab-data` → `sampling_events`/`lab_results`; `calculate_dmr_values(p_submission_id)` (migration `20260403900000_phase7_dmr_pipeline.sql`); `useDmrSubmissions.autoPopulate`; `DmrDetailPage` at `/dmr/:id` is **functional** (auto-populate, validate panel, inline edit, NODI codes, no-discharge toggle, submit → confirmation-number flow, CSV export with disclaimer). Do NOT rebuild it. The real work:

1. **Data prerequisites:** with empty `permit_limits` the RPC returns `line_count: 0` — Slice 1 is the actual unlock.
2. **Unit conversions — fix the silent fallback:** the RPC falls back to `conversion_factor 1.0` when no `unit_conversions` row matches (`20260403900000` ~L118–125) — wrong numbers with no warning. Seed/audit `unit_conversions` AND make the fallback emit a validation warning on the line item.
3. **Function-version reconciliation — GATED:** two bodies of `calculate_dmr_values` exist in the repo. The half-MDL non-detect version (`20260531130000_dmr_below_detection_half_mdl.sql`) is explicitly marked **NOT VALIDATED — do not apply to production** until a licensed environmental professional confirms per-state substitution rules (roadmap 3.11/5.02). Do not deploy it autonomously; verify which body is live in prod before touching either.
4. **Known scope gaps** (build or explicitly defer with a note): no mass/loading (lbs/day) calculation for quantity-type limits (`statistical_base` covers min/avg/max/instantaneous only); no manual "add line item" UI despite the empty-state text implying one.

### Slice 3 — ECHO discrepancy re-run (roadmap task 3.35)

0. Capture **fresh** before-counts (`external_echo_dmrs`, `discrepancy_reviews` by type, internal tables) — the Feb 2026 figures are stale.
1. **WV1024078:** it *partially* synced — facility row landed; DMR rows failed on the Edge Function compute limit. Implement the date-range-chunked retry `ECHO_SYNC_REPORT.md` recommends (the `p_start_date` param exists on the effluent call; the chunking loop does not).
2. Re-run `detect-discrepancies` after Slices 1–2 land — **wrapped in `job_runs`** (Slice 0). Note the weekly cron (`sync-echo-weekly`, Sundays 04:00 UTC) only refreshes 5 stale permits per run — the full re-run is a deliberate one-off, not "wait for cron."
3. Document before/after counts in the PR; `missing_internal` should shrink materially. Update roadmap task statuses.

### Slice 4 — Review Queue: the remainder only

**Already shipped (do NOT rebuild):** DiscrepancyTable virtualization (`@tanstack/react-virtual`), bulk triage (`bulkMarkReviewed`), `reviewed_by` tracking (+ `reviewed_at`, `review_notes`, `dismiss_reason`, `escalated_to/at`, `resolved_at`). `UNIFIED_ROADMAP.md` still marks 3.43/3.44 `not_started` — the markdown is stale, not the code. Remaining work: **task 3.45** (split loading states in `useExternalData`), correct the stale roadmap statuses, and scale-QA the queue against the post-re-run row volume.

### Slice 5 — Compliance dashboard: validate, don't rewire

Corrections to the original proposal: the route is **`/compliance/dashboard`** (`/compliance` is the Upload Dashboard); it already reads **real aggregates** from `compliance_snapshots` via `generate_compliance_snapshot` / `get_compliance_trend` (migration `20260404100000`); **`system_health_snapshots` does not exist** — do not reference it. Remaining work: validate snapshot correctness once Slice 1–3 data exists, and add a scheduled snapshot-generation cron (wrapped in `job_runs`).

### Slice 6 — VA NPDES manual override flow (roadmap task 3.38)

28 deferred VA permits per `docs/NPDES_MAPPING_CLEANUP_BACKLOG.md` — nuance: only 2 are bare-DMLR; most need VPDES/CEDS/DEQ **confirmation**, so the override UI must capture the source/confirmation basis per mapping, not just the crosswalk value. Every override audit-logged with actor. **Never** run `npm run import:npdes-mappings -- --apply` against prod (the script defaults to dry-run; keep it that way).

---

## 3. Acceptance criteria

- [ ] `get_job_health()` shows every scheduled job with a logged last run; a forced failure produces a `failed` row + audit entry (Slice 0)
- [ ] Statutory-alert surfaces show ack state; every ack is a named human on the record (Slice 0)
- [ ] Summary stat cards match raw SQL counts for permits/outfalls/limits (Slice 1)
- [ ] ≥1 DMR auto-populated from lab data and validated in UI **with zero silent unit-conversion fallbacks** (Slice 2)
- [ ] WV1024078 DMRs synced via chunked retry; full re-run completes under `job_runs`; before/after discrepancy counts documented and `missing_internal` shrinks materially (Slice 3)
- [ ] Task 3.45 done; roadmap statuses for 3.43/3.44/3.35/3.38 corrected; queue usable at post-re-run volume (Slice 4)
- [ ] Snapshot generation scheduled and validated against live data (Slice 5)
- [ ] A VA permit mapped via override UI with confirmation basis recorded, no bulk apply (Slice 6)

**Verify every slice:** `npm run typecheck && npm run lint && npm test && npm run build`, plus `npm run qa:upload-dashboard-staging` and `npm run smoke:upload-dashboard` where dashboard surfaces change.

---

## 4. Known environment facts

- **Repo-vs-prod drift is documented** (`20260531120000_reconcile_lab_results_sampling_events_to_production.sql`): the committed migration set is not from-zero replayable, and `supabase db push` reports ledger drift. Prod changes go via the MCP apply pattern with the migration file committed for future reconciliation per `supabase/BASELINE_ADOPTION.md`. **Never run migration repair/baseline adoption autonomously** (hard gate).
- Verify which `calculate_dmr_values` body is live in prod before Slice 2 work (fresh `pg_proc` check).

## 5. Hard stops (from `ENGINEERING_FREEDOM.md` — do not cross)

| Gate | Rule |
|---|---|
| State portal submit | No NetDMR/e2DMR/portal submit automation. Recording a confirmation number after a **human** submitted externally is fine (that flow exists in `DmrDetailPage`). |
| DRAFT → VERIFIED | No penalty/exposure figure marked verified for external use (needs Steve Ball / Bill Johnson + compiled decree appendix, Roadmap §7.3). |
| Non-detect policy | Do not deploy the half-MDL `calculate_dmr_values` body to prod without licensed-professional sign-off (file header says so explicitly). |
| Prod bulk mutation | No `import:npdes-mappings -- --apply` against prod; no migration repair / baseline adoption. |
| Keystone Phase 2 | No exposure positions, disclosure drafting, or completeness certification (counsel privilege gate, Roadmap §7.3/§7.4). |

## 6. Reference docs

`docs/UNIFIED_MASTER_ROADMAP.md` §6–§7 · `ECHO_SYNC_REPORT.md` (repo root) + `echo-sync-coverage.csv` · `docs/NPDES_MAPPING_CLEANUP_BACKLOG.md` · `SCC_Upload_Dashboard_Handoff_v6_DELTA.md` §12 · `supabase/BASELINE_ADOPTION.md` · `UNIFIED_ROADMAP.md` §3E (tasks 3.35–3.45)

---

*Generated by SCC Compliance Monitor tooling. Not legal advice. Not an EMS. All data and reports require independent verification by qualified personnel before regulatory or litigation submission.*
