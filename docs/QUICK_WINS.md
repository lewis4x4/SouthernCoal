# Project Sovereign — Quick Wins

**Version:** 1.0 (DRAFT)
**Date:** 2026-06-30
**Author:** UltraCode
**Status:** Recommended — awaiting Speedy's pick

> **Not Legal Advice.** Internal engineering-prioritization artifact. Nothing here is a compliance assertion, penalty determination, or legal opinion. All figures cited trace to source docs and require independent verification before any regulatory use.

---

## ⚠ Figures Verification Ledger — reconcile to source before any external or legal use

> **Status: DRAFT.** The quantitative claims below were auto-extracted by discovery agents from **real, on-disk source files** (listed under Provenance) and cross-checked by an adversarial anti-fabrication audit. They are **not yet independently reconciled**. Per the engagement's own communication rules, *every number presented to DOJ, EPA, or legal counsel must be traceable to a source document, and no specific penalty dollar amount may be cited unless the underlying data is confirmed complete and verified.* Treat this document as an internal working draft, not a citable record.

**Provenance (files confirmed to exist on disk):**
- `SOUTHERN COAL PROJECT FILES/LAB INVESTIGATION/January2026_Concerns_v2.pdf`
- `SOUTHERN COAL PROJECT FILES/Labs Sample/FTS_Defense_Summary_2025.docx`
- `SOUTHERN COAL PROJECT FILES/All_States_Feasibility_Analysis.docx`
- `SOUTHERN COAL PROJECT FILES/2025/Justice_Consent_Decree_Compliance_Analysis.pdf`
- `SOUTHERN COAL PROJECT FILES/Reports/FILE_ANALYSIS_REPORT.md` · plus `SCC_Meeting_Recap_Feb21.pdf`, `justice_companies_client_profile.md`, `ECHO_SYNC_REPORT.md`

**Flagged for reconciliation (adversarial audit findings — resolve with Bill Johnson / Steve Ball before any external use):**
1. **$9.665M 2025 penalty total does not internally reconcile** — the cited state components (KY + WV + VA + TN) sum to ~$9.657M, an ~$8K gap the January memo itself notes. Recompute from a single reconciled source; do not present the rounded total as authoritative.
2. **Force Majeure "forfeiture" is an unconfirmed observation, not a legal conclusion** — the source says a 3-business-day notice *appears not* to have been filed on S402586 ($299K) and S400311 ($8K). Whether the FM defense is actually lost is a determination for counsel (Steve Ball), not a settled fact.
3. **Headline rates rest on a self-flagged denominator** — the 12.7% failure rate, 2,289 WV misses, and 59.3% WV submission rate derive from a 30,412 "required-event" baseline that the Feb 21 recap flags as *possibly inflated*. The true denominator is unknown until the Sampling Matrix is received.
4. **Derived-from-range dollars** — figures like the ~$873K Q4 bad-road exposure and the ~$1.3M Jan-2026 roll-up appear computed from per-event ranges and do not cleanly reconcile with the $1,060,000 FTS sheet total. Show the derivation or mark GAP.
5. **Make-vs-buy economics are unvalidated** — the ~$1.8M/yr (Aquatic) vs ~$1.06M/yr (in-house) comparison and the $38.49/event break-even cannot be validated until a real lab analytical price exists (contracts negotiated in zero states).
6. **Large exact counts** (e.g., ECHO 144,339 discrepancies; 42+ VA DMLR permits) trace to named files but were not independently re-counted here.

*This ledger is the honest disclosure layer required by a litigation-grade discovery draft. Removing a figure from this document does not make it verified; reconciliation to source does.*

## Selection criteria

- **Leverage** — attacks a real, frequent, high-dollar/high-legal pain (missed-sampling, ¶49 lab-transmittal, overdue-PM) — not a nice-to-have.
- **Risk** — read/analysis over existing tables where possible; no new penalty dollars asserted, no auto-certification, no schema surgery that breaks the built compliance spine.
- **Data-readiness** — the spine tables and detection logic **already exist**; time-to-value is measured in the wiring, not the modeling.
- **No hard external blocker** — nothing here is *primarily* gated on the un-received Sampling Matrix or MSHA mine-ID map. Where a partial dependency exists, it is called out and the build is structured to activate the moment that input lands.

---

## Quick Win 1 — Nightly missed-sampling / calendar-gap detector

**Pain it solves.** Failure-to-sample, not water quality, is the litigation exposure: **3,863 missed 2025 events / 12.7% failure rate** across TN/KY/VA/WV (`SCC_Meeting_Recap_Feb21.pdf` §1; `Justice_Consent_Decree_Compliance_Analysis.pdf` p1-2), with WV worst at 59.3% submission (`SCC_Meeting_Recap_Feb21.pdf` §5). Misses are currently discovered **1-4 quarters late**; there is no automated calendar-gap detection job despite ¶49's posture (`SCC_Meeting_Recap_Feb21.pdf` §8). Every day of earlier detection reduces per-day stipulated-penalty accrual.

**Domain.** Environmental Compliance (rank 1 / composite 4.85).

**Why now / data readiness.** The spine is the richest of all 11 domains: `sampling_schedules` (with `frequency_code`, `schedule_anchor_date`, `dispatch_status`), `sampling_calendar_adjustments`, `sampling_events`, `lab_results`, and a working `dispatch_status` state machine (completed/overdue/skipped/exception) all exist and are RLS-scoped. `pg_cron` is **already running** weekly jobs (ECHO sync — `20260524120000_echo_weekly_sync_cron.sql`; exceedance digest — `20260524160000_exceedance_weekly_digest_cron.sql`), so the scheduler pattern is proven. **Partial dependency:** the calendar is fully seeded only once the Sampling Matrix lands — so build and unit-test the detection job now against the schedule tables that exist, and it activates automatically when the matrix populates the calendar.

**Effort.** M
**Risk.** Low — read-only comparison (expected calendar events vs. arrived `lab_results`); it raises a flag, it does not assert a penalty or certify anything. No schema change to the core spine.

**What ships (an officer sees).**
- A nightly `pg_cron` job that, for each active outfall/parameter, compares expected calendar events against arrived results and writes a "gap" record within 24-48 hrs of the miss window closing.
- A **"Missed / At-Risk" queue** for Steve Ball / Tom Lusk: outfall, parameter, expected date, days-late, and the field-visit outcome (overdue/skipped/exception) that explains it.
- Severity/tier is **surfaced for human review**, never auto-asserted as a dollar figure.
- Graceful empty state today; auto-populates the moment the calendar is seeded.

**Sovereignty.** Local-only (Hermes core). Raw miss records and per-outfall obligation data stay inside the audited boundary; only sanitized aggregate counts may cross.

**Audit.** Every gap-detection run logs to `audit_log` (job start/finish, rows scanned, gaps opened). Any human triage action (acknowledge, dispute, mark force-majeure) is an append-only entry with actor + timestamp.

---

## Quick Win 2 — ¶49 48-hour EDD-arrival clock + exceedance-only-data flag

**Pain it solves.** CD ¶49 requires timely, **complete** lab transmittal; labs sending **exceedance-only** rather than complete EDDs is a longstanding, recurring reporting problem (`SCC_Meeting_Recap_Feb21.pdf` §7-8; domain map, Environmental Compliance candidate 3). *(Duration assertion pending source verification — not quantified in the cited recap.)* Today lateness and incompleteness surface only in retrospective audit.

**Domain.** Environmental Compliance (rank 1).

**Why now / data readiness.** **Data-ready = yes.** The ingestion path already exists and runs: `parse-lab-data-edd` and `import-lab-data` ingest EDDs carrying an EDD `analysis_date`, and the live `lab_results` table already carries `analyzed_date`, `hold_time_met`, `is_non_detect`, and `qualifier` (production baseline `supabase/baseline/2026-05-19_production_public_schema.reference.sql` lines 10351-10373). EDDs are actively ingested via `parse-lab-data-edd`/`import-lab-data` across AL/KY/TN/VA/WV. This is a lightweight rule layered on an existing pipeline — no new external data. *(Note: an index on non-compliant hold-time is defined only in the obsolete committed CREATE `20260217170009_create_lab_results.sql`, which the reconciliation migration `20260531120000` flags as diverged from production; if a hold-time index is needed it must first be added via the reconciliation path.)*

**Effort.** S
**Risk.** Low — a deterministic comparison (analysis-complete date → arrival timestamp) plus a completeness check over data already in-platform. No new tables required; flags are advisory.

**What ships (an officer sees).**
- On each EDD ingest, an automatic **¶49 clock**: analysis-complete-to-arrival elapsed time, flagged when it breaches the 48-hour window.
- A **completeness flag** when a transmittal appears to carry exceedance-only rather than full results for the expected parameter set.
- A per-lab / per-state "late & incomplete EDD" view so Bill Johnson and counsel see the pattern as files arrive, not quarters later.

**Sovereignty.** Local-only. Raw lab values, per-lab timing, and completeness findings stay inside the boundary; only aggregated lab-performance trends may inform the boundary.

**Audit.** Each ingest writes a ¶49-evaluation record (arrival ts, analysis-complete ts, verdict) to `audit_log`; fire-and-forget so it never blocks ingestion. Completeness flags are append-only with the triggering file reference.

---

## Quick Win 3 — Defensible-miss packet generator (flanking-sample + collector fingerprint)

**Pain it solves.** Counsel explicitly asked (Feb 21) to (a) prove water was clean the week **before and after** each miss to shrink the litigable miss count, and (b) fingerprint field collectors who habitually report roads closed (`SCC_Meeting_Recap_Feb21.pdf` §8; Environmental Compliance candidate 2). Today this is a one-time manual attorney analysis.

**Domain.** Environmental Compliance (rank 1) — with a Legal/Risk (rank 2) consumer.

**Why now / data readiness.** **Partial → effectively ready.** `lab_results` carries result values, and collector identity lives on `sampling_events.sampled_by` (a uuid FK to `user_profiles`; production baseline line 11365, index `idx_sampling_events_sampled_by`, FK `sampling_events_sampled_by_fkey`), which `lab_results` links to via `sampling_event_id`. The recap's informal phrase "the 'collected by' field in lab data" (§8) is the origin, but the technical source is the `sampled_by` reference on `sampling_events`. This is read/analysis over existing data with **no schema change** — the collector view joins `lab_results`/miss records to `sampling_events`. It is an evidence-generation report, explicitly *not* a compliance assertion.

**Effort.** M
**Risk.** Low — read-only report generation. It surfaces clean flanking samples and collector patterns for counsel; it makes no legal claim and takes no autonomous action. Output routes to counsel, never acts on its own.

**What ships (an officer sees).**
- For any selected miss, a **packet** cross-referencing the nearest clean sample before and after (same outfall/parameter) with values and dates.
- A **collector-anomaly view**: frequency of "road closed / no access" outcomes grouped by `sampling_events.sampled_by` (resolved to the `user_profiles` collector), so habitual patterns are visible. *(Confirm that "road closed / no access" outcomes are captured on field-visit/exception records so the anomaly view has a real source before build.)*
- Export with the standard disclaimer one-liner appended; the packet is a defense aid for Steve Ball / outside counsel, tagged for their review.

**Sovereignty.** Local-only (Hermes core) — this is litigation-defense material. Raw values, collector identities, and packets never cross the audited boundary.

**Audit.** Packet generation and every export log to `audit_log` (who, when, which miss, which outfall) via the `useAuditLog` fire-and-forget hook — matching the existing frontend export-logging pattern.

---

## Quick Win 4 — Overdue-PM detector for field-sampling equipment (clone of the calibration RPC)

**Pain it solves.** Uncalibrated / un-maintained field gear (e.g., an out-of-cal pH meter) silently invalidates results and feeds the miss/exception problem (`SCC_Coal_Business_Comprehensive_Function_Inventory.md` §1 sampling edge cases). The proven overdue-detection loop exists **only for calibration** today; preventive maintenance on the same gear has no proactive alert.

**Domain.** Maintenance / Environmental Compliance overlap — scoped to the **field-sampling equipment already modeled**, not heavy mine assets.

**Why now / data readiness.** The exact pattern already works and is deployed: RPC `get_equipment_due_calibration()` plus `calibration_logs.next_calibration_due` drive a working overdue-detection loop (`20260403500000_phase4_training_equipment.sql:454`). `maintenance_logs` already carries `next_maintenance_due`, and `equipment_catalog` already models sampling gear (tablet/meter/gps/probe/sampler). Cloning the calibration RPC into a PM-due detector is a bounded, in-pattern build. **Scope discipline:** this deliberately covers only the sampling-gear tables that hold real data — it does **not** attempt the heavy-equipment asset register (that needs new schema + an un-received unit list from Tom Lusk).

**Effort.** S-M
**Risk.** Low — reuses a proven, deployed RPC pattern against tables that already exist and already hold field-gear data. No new penalty logic, no schema change to the core spine.

**What ships (an officer sees).**
- A `get_equipment_due_maintenance()` RPC mirroring the calibration one, flagging any sampling asset past its `next_maintenance_due`.
- An **"Overdue Gear" list** for the field/maintenance owner: asset, last service, days overdue.
- Optional: auto-open a work order via the existing `work_orders` flow when gear goes overdue (human-assigned, notified) — the "brain-is-alive" loop, scoped to field gear.

**Sovereignty.** Local-only. Equipment status is org-scoped operational data inside the boundary.

**Audit.** Detector runs and any auto-opened work order log to `audit_log` / `work_order_events` (the existing event-timeline pattern), append-only with actor + timestamp.

---

## Not recommended as first (and why)

- **Full missed-sampling program go-live / true "required-events" obligation set.** The nightly detector (QW1) is the honest slice; a *complete* per-outfall required-event ledger is **hard-gated on the un-received Sampling Matrix** to seed `sampling_calendar` (`SCC_Meeting_Recap_Feb21.pdf` §8). Build the detector now; do not promise the full obligation set until the matrix lands.

- **MSHA inspection/citation sync + abatement/contest-clock alerter.** The table (`external_msha_inspections`), function skeleton (`sync-msha-data`), and frontend hook all exist — but the function returns **503/501** with no `MSHA_MINE_ID_MAP`, and the pipeline body is a TODO stub (`sync-msha-data/index.ts`). **Primary dependency is the un-received mine-ID map from Tom Lusk.** High value, but blocked at the input.

- **Live stipulated-penalty ledger (auto-price every miss/exceedance).** Penalty columns exist on `compliance_violations` and the rate schedule is documented, but the numbers are **litigation-sensitive and must never render until the underlying compliance data is verified-complete** — which is itself blocked on the Matrix + Upload Dashboard. Ship QW1's *detection* first; asserting dollars is a later, gated phase (roadmap task 3.17, `not_started`).

---

*Generated by SCC Compliance Monitor — a compliance reporting tool. Not an EMS. Not legal or environmental consulting. All data and reports require independent verification by qualified personnel before regulatory submission.*