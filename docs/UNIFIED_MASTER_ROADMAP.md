# SCC Unified Master Roadmap — Lanes A, B, C

**Version:** 1.1
**Date:** 2026-07-01
**Status:** Active — this is the single document a code builder (Cursor/Codex/Claude) should read to know what to build next, in what order, and why.
**Supersedes:** Nothing else is deprecated. This is a *sequencing layer* on top of `BRAIN_GUIDE.md` (architecture/pitfalls), `UNIFIED_ROADMAP.md` (task IDs 3.xx/5.xx), and **`docs/ENGINEERING_FREEDOM.md`** (autonomous build vs hard human gates). Read this first for **order**, then those for **detail** and **authority**.
**v1.1:** adds §7 — the SCC-OS keystone crosswalk. The SCC-OS vision package (kept outside this repo) now feeds this roadmap; §7 maps every Lane C slice to its keystone target and lists the schema rules and gates that flow back into the current cycle.

*Not legal advice. Not an EMS. Compliance reporting tool only — every number and every automated flag requires independent human/counsel verification before regulatory or litigation use.*

---

## 0. Why this document exists

Two workstreams have been running in parallel without a shared spine:

1. **SCC Compliance Monitor** (this repo, live Supabase project `zymenlnwyzpnohljwifx`) — a working app. Lane A (WV field spine) is mid-flight; Lane B (Upload Dashboard / ECHO / DMR) is the platform's critical path.
2. **Project Sovereign** — a Phase-0 discovery exercise (`docs/DISCOVERY_QUESTIONS.md`, `docs/PAINPOINT_MAP.md`, `docs/QUICK_WINS.md`) that mapped all 11 operational domains of the coal business and found that **the highest-leverage next build targets the same Supabase tables this repo already has** — it is not a separate app.

The fix is not to pick one. It's to name Project Sovereign's near-term work **Lane C** and slot it into the same sequencing discipline (`plans/LANE_A_FIRST.md`) that already governs A vs. B. This doc is that merge.

**Engineering authority:** Add tables, migrations, Edge Functions, RPCs, and cron jobs whenever the build requires them. Extend the existing Module 1 spine — do not rebuild from scratch. Follow repo conventions: RLS on every new table, org-scoped queries, `useAuditLog` / `audit_log` for client-visible actions, RBAC on every new route. **There is no pre-approval gate for schema or backend work** — if a feature needs a table or function to exist, write the migration and ship it.

### Build principle: the machine gets built now; data is additive, not a gate

The first version of this roadmap over-indexed on "wait for the client to supply X before building Y." **That's the wrong model.** The app, the brain, and the backend get built out completely — schema, pipelines, parsers, jobs, RPCs, UI — on the timeline engineering can support, regardless of where client data-collection outreach (§5) stands. An unanswered discovery question means a feature *renders an empty/draft state*, not that the feature stays unwritten.

Concretely:
- **Build the full pipeline body**, not a stub that 503s waiting on an env var. If a config value (like an MSHA Mine ID map) is genuinely absent, the code should be complete and tested against synthetic/seed input, gated by a feature flag or a clearly-labeled "not configured" state — not left as a `TODO`.
- **Build parsers against the best-available format spec** (published state EDD/DMR schemas, the standard's own docs) even without a client-supplied sample file. Treat a real sample file as a validation/refinement input, not the prerequisite to start.
- **Build calculators and ledgers that compute against whatever rows exist**, and label output DRAFT / UNVERIFIED / based on N of M expected records — rather than declining to build the calculator until the data is "complete." Dollar-figure and legal-conclusion outputs still require a human-verification gate before *external* use (DOJ/EPA/counsel) — that gate is about who can cite the number, not about whether the code exists.
- **Seed synthetic/representative data** where useful for building and testing against realistic volumes, clearly separated from production data, so lanes aren't sitting idle waiting on a live feed to test against.
- **Add schema and backend surface area freely** — gap-detection queues, MSHA abatement clocks, parser endpoints, ledger tables, and draft penalty views all get the migrations and Edge Functions they need. Missing infrastructure is a build task, not a permission request.

Outreach (§5) still matters — it's what turns draft/empty states into populated, trustworthy ones, and a couple of items (FM notice proof, quarterly cert signatory) are genuinely legal determinations only a human can make. But it is an **accelerant**, not a **blocker**, for engineering.

---

## 1. The one-page version (for the code builder)

| Lane | What | Where it stands | Do next |
|------|------|------------------|---------|
| **A — WV field spine** | Offline-capable field sampling app | M1 code-ready, staging sign-off pending. M2 (offline sync) code shipped, QA pending. | **Nothing to build.** Run staging QA (§2). Do not start new Lane A features until A1–A6 + B1–B5 close. |
| **B — Compliance platform** | Upload Dashboard, ECHO, DMR pipeline | Upload Dashboard is the unbuilt critical path; ECHO sync (3.49–3.52) and queue routing shipped. | Build in parallel with Lane C — don't wait for Lane A staging sign-off to start Upload Dashboard work (`SCC_Upload_Dashboard_Handoff_v5.md` + v6 DELTA); staging QA is a QA-team task, not an engineering blocker. |
| **C — Sovereign Quick Wins + MSHA + parsers** | Detection/reporting, MSHA sync, VA/TN/AL parsers, ledgers | Not started. Full stack — migrations, RPCs, Edge Functions, UI as needed. | Build QW1 → QW2 → QW4 → QW3 (§3), **and** MSHA pipeline body + VA/TN parsers + draft ledgers (§3 "Build now") — complete code, not stubs. |
| **Outreach — Sovereign discovery** | Data the client (Justice/SCC) must supply to move features from draft/empty to populated/verified | 6 BLOCKER items open, routed to Tom Lusk / Bill Johnson / Steve Ball / Jon Lawson / Brad Morrison / Jay Justice | Send `docs/DISCOVERY_QUESTIONS.md` this week (§5). Runs fully in parallel with engineering — it raises data quality and unlocks legal certainty, it does not gate what gets built. |

**The single biggest unlock in the entire roadmap:** the Sampling Matrix (Q14, Tom Lusk/Bill Johnson) and the MSHA Mine ID list (Q3, Tom Lusk). Chase these in parallel with all engineering below — but build QW1's detector and the MSHA pipeline body now regardless; they'll sit in a labeled empty/not-configured state until the data lands, then activate without further engineering work.

---

## 2. Lane A — close it out (no new code)

Per `Roadmap/LANE_A_MILESTONE_1.md` and `LANE_A_MILESTONE_2.md`, both milestones are **code-complete and sitting in PR #21** (branch `overnight/20260701-goal-pack`). Nothing here is a build task — it's a checklist:

1. Merge PR #21 to `main`.
2. Run staging QA **A1–A6** (Milestone 1 closure worksheet).
3. Run staging QA **B1–B5** (`Roadmap/LANE_A_MILESTONE_2_QA.md`) — automated coverage already exists via `npm test -- milestone2QaCoverage` and `src/lib/milestone2QaMap.ts`; B1–B5 is the *manual* staging sign-off layer on top of that.
4. Apply the two new cron migrations (ECHO weekly sync, exceedance weekly digest) and deploy new Edge Functions to Supabase if not already live.
5. Optional: run `npm run report:npdes-gaps` once `SUPABASE_SERVICE_ROLE_KEY` is in `.env.local`.

**Gate:** Lane A is "done" (per `plans/LANE_A_FIRST.md`) once A1–A6 and B1–B5 both close. Lane B and Lane C **engineering continue in parallel** during QA — see `docs/ENGINEERING_FREEDOM.md`.

---

## 3. Lane C — Project Sovereign Quick Wins, in build order

All four Quick Wins were screened against: (a) can be built by extending the existing spine (add tables/RPCs/jobs where missing — do not wait for them to pre-exist), (b) advisory at the UI layer (DRAFT labels on dollar figures; no auto-certification or legal conclusions), (c) not blocked on client data — empty/draft states are fine. Build in this order — each is independently shippable; order maximizes legal-exposure reduction per engineering effort (weighting: legal .30 / dollar .25 / frequency .15 / people .15 / automatability .15, per `PAINPOINT_MAP.md` §Method).

### QW1 — Nightly missed-sampling / calendar-gap detector (build first)
- **Why first:** Attacks the #1 ranked pain (composite 4.85/5) — failure-to-sample is the actual Consent Decree litigation exposure, not water quality. Misses are currently found 1–4 quarters late.
- **Tables (exist, RLS-scoped):** `sampling_schedules`, `sampling_calendar_adjustments`, `sampling_events`, `lab_results`.
- **Pattern to clone:** the weekly `pg_cron` jobs already in the repo (`20260524120000_echo_weekly_sync_cron.sql`, `20260524160000_exceedance_weekly_digest_cron.sql`) — same scheduling mechanism, new comparison logic.
- **Ships:** nightly job comparing expected calendar events vs. arrived `lab_results`; a "Missed / At-Risk" queue (outfall, parameter, expected date, days-late, field-visit outcome). Severity surfaced for human review — never auto-priced.
- **Empty state, ship anyway:** sparsely populated until the Sampling Matrix lands (§5, Q14). Build and unit-test against the schedule rows that exist today — seed synthetic obligation rows if needed to test the job at realistic volume. It activates automatically once the matrix populates the calendar.
- **Audit:** every run logs to `audit_log` (job start/finish, rows scanned, gaps opened); any human triage action is append-only with actor + timestamp — same pattern as `useAuditLog`.

### QW2 — ¶49 48-hour EDD-arrival clock + exceedance-only-data flag
- **Why second:** Fully data-ready today (no partial dependency), low effort, and it directly targets a longstanding, recurring CD ¶49 violation pattern (labs sending exceedance-only data instead of complete EDDs).
- **Tables (exist):** `lab_results` already carries `analyzed_date`, `hold_time_met`, `is_non_detect`, `qualifier`. Ingestion already runs through `parse-lab-data-edd` / `import-lab-data`.
- **Ships:** on each EDD ingest, a clock comparing analysis-complete → arrival timestamp, flagged past 48 hrs; a completeness flag when a transmittal looks exceedance-only; a per-lab/per-state "late & incomplete EDD" view for Bill Johnson and counsel.
- **Note:** the hold-time index referenced in `PAINPOINT_MAP.md` lives only in an obsolete migration (`20260217170009_create_lab_results.sql`) that a later reconciliation migration (`20260531120000`) flags as diverged from production. If you need that index, add it via the reconciliation path — do not resurrect the old migration directly.

### QW4 — Overdue-PM detector for field-sampling equipment (do before QW3)
- **Why here:** Smallest effort (S–M), zero new tables, clones a pattern that's *already deployed* — `get_equipment_due_calibration()` + `calibration_logs.next_calibration_due`. Uncalibrated/unmaintained field gear silently invalidates results and feeds directly into the QW1 miss queue, so shipping this before QW3 gives QW3's packets cleaner inputs.
- **Tables (exist):** `maintenance_logs.next_maintenance_due`, `equipment_catalog` (already models sampling gear: tablet/meter/gps/probe/sampler).
- **Scope discipline:** field-sampling gear only. Do **not** extend this to a heavy-equipment asset register (haul trucks, dozers) — that's a Painpoint Map domain-11 item (Fleet & Heavy Equipment), gated on an un-received unit list from Tom Lusk, and out of scope for Quick Wins.
- **Ships:** `get_equipment_due_maintenance()` RPC (mirrors the calibration RPC); an "Overdue Gear" list; optionally auto-open a `work_orders` row on overdue gear (human-assigned/notified — same event-timeline pattern as `work_order_events`).

### QW3 — Defensible-miss packet generator (flanking-sample + collector fingerprint)
- **Why last:** Highest-value legal deliverable (counsel explicitly asked for this at the Feb 21 meeting) but depends on QW1's miss queue existing to have something to generate a packet *for*, and benefits from QW4 flagging equipment issues that explain some misses.
- **Core joins (extend as needed):** `lab_results` → `sampling_events` via `sampling_event_id`; collector via `sampling_events.sampled_by` → `user_profiles`. Add packet/export storage tables or RPCs if the report workflow needs them.
- **Ships:** for any selected miss, a packet cross-referencing the nearest clean sample before/after (same outfall/parameter); a collector-anomaly view (frequency of "road closed/no access" grouped by collector). Export carries the standard disclaimer one-liner.
- **Before you build:** confirm "road closed / no access" outcomes are actually captured on field-visit/exception records (the recap's informal "collected by field in lab data" phrase needs a real source check) — this is a 30-minute data-check, not a discovery blocker.
- **Routing:** output goes to Steve Ball / outside counsel for review. It is evidence, not an assertion — the code must never present it as a compliance or legal conclusion.

### Build now, in draft/empty-state mode (do not leave as stubs waiting on client data)

These were previously framed as "blocked" — they're not. Each has a legitimate code-complete target today; what's actually gated is *verified, citable output*, which is a rendering/labeling concern, not a build concern.

- **MSHA inspection/citation sync + abatement-clock alerter.** `external_msha_inspections` and `sync-msha-data` already exist; the function currently 503s with no `MSHA_MINE_ID_MAP` and 501s (pipeline body TODO) once one is set. **Build the full pipeline body now** — download/parse/upsert against the public MSHA OGD Violations feed — and test it against a small synthetic Mine ID map (a few real public mine IDs work fine for testing the plumbing). When Tom Lusk's real map lands (§5, Q3), it's a config change, not a build. Layer the abatement/contest-clock alerter on top immediately after — same "build against the schema that exists" principle.
- **VA/TN lab parsers.** Currently blocked-in-name-only on "unknown formats." VA DMLR and TN OSMRE/MyTDEC publish standard EDD/quarterly-report layouts — build the parsers against the public format spec now, with defensive validation (reject/flag rows that don't match expected shape rather than silently misparsing). Treat Bill Johnson's sample files (§5, Q27) as a validation/refinement pass, not the unlock event.
- **Full missed-sampling obligation ledger** (the *complete* per-outfall required-events set). Build the schema-population logic and UI now against whatever `sampling_schedules` rows exist (real + synthetic-for-testing); it fills in incrementally as the Sampling Matrix (§5, Q14) and Upload Dashboard populate more permits/outfalls. Don't wait for 100% coverage to ship a partial, clearly-labeled ledger.
- **Live stipulated-penalty ledger** (price every miss/exceedance against the CD rate schedule). The columns and rate-tier logic already exist (`compute_stipulated_penalty` pattern from `consent_decree_obligations`) — **build the calculator now.** It computes and displays a running total labeled **"DRAFT — internal estimate, not verified for external/legal use"** at all times until Steve Ball/Bill Johnson sign off on completeness (roadmap task 3.17). The gate is a UI badge and an audit-logged sign-off action, not an unwritten feature.
- **Alabama ingestion.** AL is 100% manual today. Build the same EDD/import pipeline pattern used for KY/VA/TN now, ready to accept Brad Morrison's LRS/Waypoint files (§5, Q54) the moment they arrive in any structured format (CSV export, even a reasonably consistent spreadsheet) — don't wait for a "final" format before scaffolding the importer.

---

## 4. Sequencing decision — A/B/C run in parallel, all the time

Engineering does not wait on data collection, and does not wait on QA sign-off to start the *next* lane's build. All three lanes advance simultaneously; the only sequencing that matters is within a lane, and between build vs. sign-off (which are different people's work):

```
Continuously:  Lane A staging QA (A1–A6, B1–B5) + merge PR #21        [QA track]
Continuously:  Lane B — Upload Dashboard v5+v6 DELTA build             [engineering track]
Continuously:  Lane C — QW1 → QW2 → QW4 → QW3, MSHA pipeline body,
               VA/TN/AL parsers, penalty ledger (draft-labeled)        [engineering track]
Continuously:  Brian sends DISCOVERY_QUESTIONS.md to Tom/Bill/Steve/   [outreach track —
               Jon/Brad/Jay, prioritized per §5                        accelerates, doesn't gate]
```

Within Lane C, build order (QW1 → QW2 → QW4 → QW3, then MSHA/parsers/ledger/AL) still matters for effort-to-leverage reasons — but none of it waits on Lane A/B status or on outreach answers. If a build task's *only* open item is "needs a client-supplied file/config," build it anyway against best-available specs or synthetic data and land the config/file when it arrives.

---

## 5. Parallel track — Sovereign discovery outreach (Brian's, not the code builder's)

`docs/DISCOVERY_QUESTIONS.md` has 56 questions across 6 owners. These don't block Quick Win *builds*, but they cap what Quick Wins can *show*, and two of them (Q14, Q3) also gate future Lane C work (full obligation ledger, MSHA sync). Suggested send order by urgency:

| Priority | Owner | Question(s) | Unlocks |
|----------|-------|--------------|---------|
| 1 | Steve Ball | Q35 (FM notice filing proof, S402586/$299K + S400311/$8K) | Resolves the single largest live legal-exposure question — whether the FM defense is actually at risk. Time-sensitive; do not batch with the rest. |
| 2 | Tom Lusk | Q14 (Sampling Matrix delivery date) | Full QW1 population; the entire compliance calendar |
| 3 | Tom Lusk | Q3 (MSHA Mine ID list) | Unblocks `sync-msha-data` (currently 503/501) and the entire MSHA domain |
| 4 | Bill Johnson | Q27, Q28 (VA/TN lab file samples, canonical parameter dictionary) | Unblocks the two BLOCKED parsers and prevents silent exceedance-detection gaps from unmapped parameter names |
| 5 | Jon Lawson | Q51 (VA active-outfall list + DMLR→NPDES crosswalk) | Unblocks VA ECHO sync (42 permits currently can't sync) |
| 6 | Brad Morrison | Q54 (AL machine-readable lab data) | Unblocks Alabama, which is currently 100% excluded from every enterprise total |
| 7 | Jay Justice | Q55 (in-house sampling program go/no-go) | Unlocks the $1.8M vs $1.06M make-vs-buy decision once Bill Johnson's lab-price question (Q32) is also answered |

Everything else in `DISCOVERY_QUESTIONS.md` can go out as a single consolidated packet — it doesn't gate near-term engineering.

**Reminder baked into the source docs and worth repeating here:** every dollar figure in the Sovereign docs (the $9.665M penalty total, the $1.8M/$1.06M make-vs-buy figures, the $126K fine question) is flagged DRAFT/unreconciled by the docs' own verification ledger. Nothing here should be quoted externally, to DOJ/EPA, or to counsel without Bill Johnson/Steve Ball reconciling it first.

---

## 6. What "done" looks like for this roadmap cycle

- [ ] Lane A: PR #21 merged, A1–A6 + B1–B5 staging QA signed off
- [ ] Lane B: Upload Dashboard v5+v6 DELTA shipped (built in parallel, not after Lane A)
- [ ] Lane C: QW1, QW2, QW4, QW3, MSHA pipeline body, VA/TN/AL parsers, and the draft-labeled penalty ledger all shipped, typechecked, tested, audit-logged — each renders a clearly labeled draft/empty/not-configured state wherever source data hasn't landed yet, rather than being left unbuilt
- [ ] Lane C schema discipline: new detector/ledger tables follow the §7.2 rules (coupled work orders at insert, bitemporal columns, `citation` + `verification_status` on penalty rows)
- [ ] Outreach: DISCOVERY_QUESTIONS.md sent, at minimum Q35/Q14/Q3 answered

None of these boxes blocks another — they check independently, on their own tracks. As outreach answers and Upload Dashboard data land, previously-draft/empty Lane C features populate automatically with no further engineering work, because the machine was already built to receive them.

---

## 7. SCC-OS keystone crosswalk (added v1.1)

The SCC-OS vision package — keystone memo, gap audit, and builder handoff — lives **outside this repo** at `/Users/brianlewis/Southern Coal/SOUTHERN COAL/` (start with `SCC-OS_BUILDER_HANDOFF.md` there). It stays outside deliberately: it is strategy material that does not belong in a pushed repository. This section is the only SCC-OS content maintained in-repo: the mapping from this roadmap's slices to the keystone architecture, plus the build rules and gates that flow back into the current cycle.

**Relationship:** the keystone package *feeds* this roadmap; it does not override it. This doc still decides **order**; `ENGINEERING_FREEDOM.md` still decides **authority**; `CLAUDE.md` still owns audit/RLS/RBAC mechanics.

### 7.1 Crosswalk — every Lane C slice is an early organ of the keystone

| This roadmap (build now) | Keystone target (memo §4/§6) | Upgrade path |
|---|---|---|
| QW1 missed-sampling detector | Adverse-fact detector #1 | QW1 miss rows are proto-`adverse_facts`; insert a coupled `work_orders` row in the same transaction (no orphan alerts) |
| QW2 ¶49 EDD clock + completeness flag | Adverse-fact detector #2 + lab-data rigor (gap audit T1-3) | Extend `lab_results` toward full Part 136 method / MDL-ML / qualifier / non-detect-policy coverage as the parsers land |
| QW4 overdue-PM detector | Evidence-quality guard | Feeds defensible-miss context; scope stays sampling-gear-only |
| QW3 defensible-miss packet | Proto evidence package (keystone Completeness Certificate / FM evidence file lineage) | Same export path; packets are evidence for counsel, never conclusions |
| Draft stipulated-penalty ledger (§3 build-now) | **The Exposure Ledger — keystone wedge step 1** | `compute_stipulated_penalty` + DRAFT badge → `penalty_regimes` (a `citation` + `verification_status` per row) → `penalty_curves` |
| Full missed-sampling obligation ledger (§3 build-now) | Obligation enumeration substrate | Must eventually enumerate SMCRA + MSHA clocks too (gap audit T2-15) or downstream completeness claims over-claim |
| MSHA pipeline body + abatement clocks | MSHA-side adverse-fact detectors | The controller-ID mapping (106 mines → 16 orgs) is the seed of temporal ownership/control edges (gap audit T1-1) |

### 7.2 Rules that flow back into this cycle (adopt now — cheap now, brutal to retrofit)

1. **No orphan alerts:** every new detector inserts its gap/miss row and a coupled `work_orders` row in the same transaction.
2. **Bitemporal columns on every new ledger/fact table** (valid time + transaction time), per the standard pattern; do not retrofit later at 10× the cost.
3. **Penalty rows carry `citation` + `verification_status`.** Nothing flips DRAFT → VERIFIED until the CD stipulated-penalty appendix is compiled into verified rows **and** the task-3.17 human sign-off lands.
4. **Degraded-mode logging:** nightly jobs record their own failures as audit events — a failed run is a logged fact, never silence.
5. **Ack-tracked alerts:** any alert tied to a statutory clock needs acknowledgment tracking (proof of receipt), not just send.

### 7.3 Gates (authority lives in `ENGINEERING_FREEDOM.md` — mirrored there in v1.2)

- **Decree-compilation gate:** the DRAFT → VERIFIED flip on any penalty figure requires the compiled Case 7:16-cv-00462-GEC stipulated-penalty appendix (verified `penalty_regimes` rows) plus human sign-off (3.17 pattern).
- **Counsel privilege gate:** no SCC-OS Phase 2 feature (exposure positions, self-assessment or disclosure drafting) starts before counsel settles the privilege architecture. Not this cycle.
- The existing **verified-dollar** and **external submit/certify** gates continue to cover any number or document leaving the building.

### 7.4 Explicitly NOT in this cycle

Keystone Phase 2+ surfaces — exposure positions, disclosure drafting, completeness certification, voice-native field capture, any counterparty-facing attestation — are all behind named gates in the handoff sheet. This cycle builds the detectors, ledgers, and schema discipline they will stand on. Build nothing from this list without the §7.3 gates clearing first.

---

*Generated by SCC Compliance Monitor tooling. Not legal advice. Not an EMS. All data and reports require independent verification by qualified personnel before regulatory or litigation submission.*
