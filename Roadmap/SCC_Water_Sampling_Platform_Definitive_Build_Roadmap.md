# SCC Water-Sampling Platform — Definitive Build Roadmap

**Version:** 1.1 | **Date:** March 31, 2026 | **Classification:** Internal Engineering Document  
**Prepared by:** BlackRock AI | **For:** Southern Coal Corporation — West Virginia In-House Sampling Program

> **Complete roadmap hub:** Start with **[`UNIFIED_ROADMAP.md`](../UNIFIED_ROADMAP.md)** — it defines how this document, the **Codex Handoff** roadmap, and Supabase **`roadmap_tasks`** work together without thrashing between “phases.”
>
> **Phase numbering:** **This document’s part/phase labels** (e.g. “Phase 2: Field Event Capture”) **do not match** **Codex Handoff** phase numbers (e.g. Codex Phase 2 = calendar & routes). Always use the **crosswalk table** in `UNIFIED_ROADMAP.md` before comparing milestones across docs.
>
> **Execution order for WV field software:** Follow **`Roadmap/SCC Water Sampling Platform — Codex Handoff Roadmap.md`** §7 for what to build next in code; use **this file** for acceptance criteria, manual § references, and program narrative.

---

## 1. Executive Summary

### Current State

The platform has a functional Supabase backend with **102 tables** (far beyond the original 44-table schema doc), **27 deployed Edge Functions**, and a React/TypeScript frontend with Layers 0–2 complete and Layers 3–4 partially built. Key data already loaded: 142 NPDES permits, 831 outfalls, 7,456 permit limits (AI-extracted, unverified), 771 lab result records, 336,403 historical EPA ECHO DMR records, 146,019 discrepancy reviews, 10,409 audit log entries, and 1,216 files processed through the upload queue. The compliance search engine is operational with 2,407 document chunks embedded.

The platform was designed as a compliance monitoring dashboard. What now must be built is fundamentally different: a **field operations system** — the internal operating system for a self-run water-sampling program under Consent Decree supervision. The WV Operations Manual (v2.0, governance-locked) defines this system. The manual is the controlling operational design.

### End-State Vision

A decree-first, field-to-DMR operating system that:

- Generates sampling routes and schedules from permit data, enforcing semi-monthly spacing, short-hold prioritization, and rain-event logic
- Captures every field event (sample, no-discharge, access issue, force majeure candidate) with GPS, photos, timestamps, and chain-of-custody in an offline-capable mobile interface
- Ingests lab EDDs from Mineral Labs within 48 hours per ¶49, auto-detects exceedances, fires tiered alerts, and starts the 3-business-day / 7-calendar-day force majeure clock
- Routes compliance-review issues through the locked governance chain (Bill Johnson → Tom Lusk → President/CEO → Chief Counsel) with full decision logging
- Calculates DMR values per state-specific rules, generates quarterly reports (Attachments A–G), and maintains proof-of-submission evidence
- Tracks every training record, competency verification, calibration check, and equipment assignment as compliance artifacts
- Operates offline in the field, syncs when connectivity returns, and resolves conflicts deterministically
- Scales to KY, TN, VA, AL without WV-specific assumptions baked into core logic

### Biggest Gaps

1. **No field-event capture system exists.** The entire field sampling workflow (outfall visit → inspection → sample/no-discharge → custody → photo → sync) has zero software built. This is the manual's core requirement.
2. **No sampling calendar/route generation engine.** The `sampling_calendar` and `sampling_schedules` tables are empty. No logic generates dates from frequency rules, enforces semi-monthly spacing, routes by zone, or accounts for short-hold parameters.
3. **No DMR calculation engine.** Monthly avg, daily max/min, sample counts, NODI codes, below-detection handling per state rules — none of this is built.
4. **No governance/decision-routing engine.** The locked escalation path (Bill Johnson → Tom Lusk → President/CEO → Chief Counsel) has no software implementation. No compliance-review issue routing, no deadline tracking, no decision logging with decree paragraphs.
5. **No Mineral Labs integration spec or data contract.** Lab data import Edge Functions exist, but no formal agreement on format, timing, exceedance notification, corrected-file handling, or sample receipt confirmation.
6. **No offline/mobile architecture.** Field work happens in remote WV locations outside cell coverage. No service worker, no local storage strategy, no conflict resolution, no offline queue.
7. **Permit limits are unverified.** 7,456 AI-extracted limits exist but Environmental Manager verification (task 3.05) has not occurred. The system cannot check compliance against unverified limits.
8. **The Sampling Matrix has not been received from Tom.** This remains the #1 external blocker.

### Biggest Build Risks

- **Field app late delivery** — If the field capture system isn't ready before the in-house program launches, samplers fall back to paper, and the evidence chain breaks immediately
- **Mineral Labs data format mismatch** — If Mineral Labs cannot deliver 48-hour EDDs in the 26-column format, the entire lab ingestion pipeline stalls
- **Offline sync corruption** — If conflict resolution logic has edge cases, field data can be lost or duplicated in ways that compromise compliance records
- **Permit limit verification bottleneck** — 7,456 limits across 142 permits require human review. If this doesn't happen in parallel with software development, compliance checking is DOA at launch
- **Governance chain not yet reflected in software** — Every compliance-review issue, force majeure candidate, and compromised-sample determination must route through Bill Johnson first. If this isn't built, the program isn't decree-compliant

### Biggest Opportunities

- **336,403 historical ECHO DMR records already loaded** — Immediate validation dataset for DMR calculation engine (task 3.11 acceptance test)
- **27 Edge Functions already deployed** — Most of the data ingestion pipeline exists; what's missing is the field-facing half
- **WV-first design locks in multi-state architecture** — Every decision made for WV can be parameterized for KY/TN/VA/AL if done right
- **In-house sampling eliminates the #1 source of missed samples** — Coordination failure between external labs and field staff. The platform can prevent this by controlling scheduling, routing, and bottle logistics

---

## 2. Current-State Build Assessment

### What Already Exists (Do Not Rebuild)

| Component | Status | Evidence |
|-----------|--------|----------|
| Database schema: 102 tables, all RLS-enabled | Deployed | Live Supabase query confirms |
| Upload Dashboard (Layer 1) | Complete | GlobalDropZone, SmartStaging, ProcessingQueue, useFileUpload, useRealtimeQueue, useAutoClassify |
| File processing pipeline | Complete | 1,216 files processed, file-upload-handler EF (v7) |
| Permit PDF parser | Complete | parse-permit-pdf EF (v26), 435 permits parsed |
| Lab EDD parser | Complete | parse-lab-data-edd EF (v24), 771 files parsed |
| Lab data import | Complete | import-lab-data EF (v14), bulk-import-lab-data EF (v2) |
| Permit limits import | Complete | import-permit-limits EF (v4), 7,456 limits loaded |
| Compliance search (SQL + semantic) | Complete | compliance-search EF (v7), document-search EF (v9), 2,407 chunks embedded |
| EPA ECHO sync | Complete | sync-echo-data EF (v30), 336,403 historical DMRs, 149 facilities |
| MSHA sync | Deployed | sync-msha-data EF (v7), blocked on mine IDs |
| Discrepancy detection | Complete | detect-discrepancies EF (v21), 146,019 reviews |
| Deadline alerting | Deployed | send-deadline-alert EF (v3) |
| Report generation framework | Deployed | generate-report EF (v4), report-status EF (v3), run-scheduled-reports EF (v1), 30 report definitions |
| Corrective action PDF generation | Deployed | generate-corrective-action-pdf EF (v4) |
| NetDMR parser | Deployed | parse-netdmr-bundle EF (v5) |
| Parameter sheet parser | Deployed | parse-parameter-sheet EF (v5) |
| FTS (Fine-Tracking-System) parser | Deployed | parse-fts-excel EF (v7) |
| Audit log | Active | 10,409 entries, immutable trail |
| Executive Dashboard shell (Layer 4) | Partial | UI shells exist, no live data wiring |
| Compliance governance tables | Partial | Migration 005 applied, UI shells built |
| Corrective action workflow | Partial | CorrectionsPage built, needs exceedance linkage |
| CD obligation tracker | Partial | 75 obligations seeded, UI exists, needs evidence attachments |
| Access control UI | Partial | AccessControlPage + hooks built, needs testing |

### What Is Partially Built (Complete, Don't Restart)

| Component | What Exists | What's Missing |
|-----------|------------|----------------|
| Executive Dashboard (Layer 4) | SummaryStats, FinancialRiskCard, OperationalStatusCard, ActionQueueCard, QuickAccessTiles | Real Supabase queries replacing placeholder data |
| Exceedance alerting | send-deadline-alert EF, 49 exceedances detected | Integration with real-time exceedance detection on new lab imports |
| Stipulated penalty calculator | Migration 004 penalty functions | UI wiring, tested calculations |
| CD obligation tracker | 75 obligations seeded, Obligations.tsx | Evidence attachment UI, proof-of-submission workflow |
| Implementation Roadmap module | RoadmapPage.tsx + useRoadmapTasks | Full 178-task population |

### What Is Missing (Must Be Built)

| Component | Priority | Manual Section |
|-----------|----------|----------------|
| **Field-event capture system** (mobile/tablet) | CRITICAL | §7, §8, §9 |
| **Sampling calendar/route generator** | CRITICAL | §6 |
| **DMR calculation engine** | CRITICAL | §10 |
| **Governance decision-routing engine** | CRITICAL | §2, Governance Addendum |
| **Offline sync architecture** | CRITICAL | §10, §12 |
| **No-discharge documentation workflow** | CRITICAL | §8 |
| **Force majeure identification + deadline tracking** | CRITICAL | §8 |
| **Chain-of-custody digital workflow** | CRITICAL | §9 |
| **Compromised sample escalation** | HIGH | §9 |
| **Access issue escalation** | HIGH | §8 |
| **Training/competency tracking module** | HIGH | §4 |
| **Equipment/calibration tracking** | HIGH | §5 |
| **Bottle kit management** | HIGH | §5, §9 |
| **Safety/lone-worker check-in system** | HIGH | §12 |
| **QA/QC review workflows** | HIGH | §11 |
| **Quarterly report generator (Attachments A–G)** | HIGH | §13 |
| **DMR review/approve/submit workflow** | HIGH | §10 |
| **Management confirmation layer** | HIGH | §10 |
| **Supervisor ride-along tracking** | MEDIUM | §7 |
| **Route revalidation tools** | MEDIUM | §6 |
| **Document version control / manual revision tracking** | MEDIUM | §13 |
| **24-hour notification log** | MEDIUM | CD ¶ requirements |

### What Is Technically Blocked

| Blocker | Impact | Owner |
|---------|--------|-------|
| Sampling Matrix from Tom | Cannot verify permit limits, cannot generate sampling calendars, cannot validate any compliance checking | Tom Lusk |
| Environmental Manager permit limit verification | 7,456 AI-extracted limits cannot be used for compliance until human-verified | SCC Management |
| Historical DMR submissions | Cannot run acceptance test (system calcs vs actual submissions) | Tom Lusk |
| Named personnel for all roles | Cannot assign platform roles, cannot complete EMS, cannot test escalation chains | Tom Lusk |
| Mineral Labs service-level commitments | Cannot build lab integration without agreed format, timing, exceedance notification | Tom / Bill Johnson |
| WVDEP sampler certification confirmation | Must verify if state-specific certification applies to SCC employees | Bill Johnson |

### What Should Remain Untouched

- All 102 existing tables — do not modify schema unless a migration is explicitly designed and approved
- All 27 deployed Edge Functions — extend through new functions, do not refactor deployed ones
- 32 existing RLS policies and 8 storage buckets — add new policies as needed, do not restructure
- Living Crystal design system — maintain glassmorphism aesthetic for consistency
- The Upload Dashboard (Layer 1) — complete and functional
- Search infrastructure (Layer 1.5) — complete and functional
- External data sync (Layer 2) — complete and functional

---

## 3. Operating Model Translation

### How the Manual Translates to Software

The WV Operations Manual defines a field program with 5 roles, 3 geographic zones, 313 monitored points, and a daily workflow that runs from pre-trip sync through end-of-day upload. Every element maps to a software requirement.

### Role-by-Role Mapping

| Manual Role | Base | Platform Role | Software Capabilities |
|------------|------|---------------|----------------------|
| **Field Sampler 1** | Beckley | Field Sampler | Mobile app: route execution, outfall visit recording, sample capture, no-discharge documentation, photo capture, GPS logging, field meter readings, chain-of-custody initiation, safety check-ins |
| **Field Sampler 2** | Beckley | Field Sampler | Same as above, Central zone routes |
| **Field Sampler 3** | West zone base | Field Sampler | Same as above, West zone routes with longer travel, higher logistics sensitivity |
| **Runner / Coordinator** | Regional | Runner/Coordinator (new role) | Bottle kit preparation tracking, sample transport logging, cooler handoff receipts, absence coverage scheduling, lab delivery confirmation, equipment inventory, staging facility access logs |
| **WV Field Supervisor** | Beckley | Environmental Manager (WV) | Route approval, schedule override authority, ride-along logging, data completeness review, issue response, deficiency assignment, training sign-off, competency verification, lab coordination, QA/QC oversight |
| **Bill Johnson** | Corporate | Chief Compliance Officer | First-line compliance decision authority, compliance-review issue resolution, force majeure determination, compromised-sample ruling, governance dashboard, decree paragraph linkage review |
| **Tom Lusk** | Corporate | Chief Operating Officer | Operational escalation, budget/procurement authority, staffing decisions, program-level reporting, escalated issue resolution |
| **President/CEO** | Corporate | Executive | Executive escalation visibility, top-level business authority dashboard |
| **Chief Counsel** | Corporate | Legal | Legal escalation, privilege-sensitive decisions, notice/deadline review, regulatory interpretation |

### Workflow-by-Workflow Mapping

#### Workflow 1: Daily Field Sampling (Manual §7)

**Human process:** Sync → equipment readiness → calibration status → bottle verification → route review → drive to outfalls → at each outfall: location confirm → outlet inspection → discharge determination → sample or no-discharge documentation → photos → chain-of-custody → next outfall → end-of-day sync → issue escalation.

**Software translation:**

| Step | Field Action | Platform Feature | Data Objects Created |
|------|-------------|-----------------|---------------------|
| 1 | Morning sync | Auto-download today's route, pending alerts, schedule changes | `sync_event` |
| 2 | Equipment check | Calibration log entry, meter serial capture, expiration check | `calibration_log` entry |
| 3 | Bottle verification | Scan/confirm bottle kit ID, match to route outfalls, verify preservative types | `bottle_kit_assignment` |
| 4 | Route review | Interactive map with outfall pins, drive-time estimates, known access issues flagged | Route loaded from `sampling_calendar` |
| 5 | Outfall arrival | GPS auto-capture, location confirmation, timestamp | `sampling_event` created |
| 6 | Outlet inspection | Structured checklist: signage, pipe condition, flow status, erosion, obstructions | `outlet_inspection` record |
| 7a | Sample collected | Parameter selection (from permit schedule), field readings (pH, temp, conductivity), container-to-outfall assignment, preservation confirmation | `sampling_event` updated, `field_measurements` |
| 7b | No-discharge | Photo required (absence of flow + physical condition), narrative, cannot mark complete without photo | `no_discharge_event` with photo evidence |
| 7c | Access denied | Photo of obstruction, contact attempted, escalation initiated | `access_issue` with escalation chain |
| 8 | Chain of custody | Container ID → outfall → parameter mapping, cooler assignment, temperature log, seal number | `chain_of_custody` record |
| 9 | End of day | Sync all events, flag incomplete visits, cooler handoff to runner/lab | Batch sync, `custody_transfer` |
| 10 | Issue escalation | Auto-surface: missed outfalls, compromised samples, access issues, force majeure candidates | Notifications per governance chain |

#### Workflow 2: No-Discharge Documentation (Manual §8)

**Legally sensitive.** Management position: no-flow event must be documented with proof that effluent is not present and condition is not caused by obstruction. Photo documentation required.

**Software requirements:**
- Cannot mark a no-discharge visit as complete without at least one photo attachment
- Must record: observed condition at actual sampling point, any observed obstruction/blockage, alternate explanation if present
- Must NOT treat as "complete for reporting" unless documentation standard is satisfied
- No-discharge events feed into DMR NODI codes
- If pattern detected (same outfall, multiple no-discharge events), flag for supervisor review

#### Workflow 3: Force Majeure (Manual §8)

**Critical deadline:** Under the Consent Decree, notice within 3 business days of first knowledge, written explanation within 7 calendar days. Missing the notice timing forfeits the force majeure defense entirely.

**Software requirements:**
- Field sampler marks event as potential force majeure candidate with evidence (photos, narrative)
- System immediately calculates 3-business-day notice deadline and 7-calendar-day written explanation deadline
- Routes to Bill Johnson for immediate review
- If Bill Johnson doesn't act within 24 hours, auto-escalates to Tom Lusk with countdown timer
- Logs every decision, timestamp, decree paragraph (¶ force majeure provisions), evidence attachment
- Borderline cases must elevate immediately — the app classifies "obvious" candidates but all borderlines go to Bill Johnson within hours, not days

#### Workflow 4: Chain of Custody → Lab Handoff (Manual §9)

**Non-negotiable controls:** Correct bottle/preservative/parameter match, documented collection time, sample condition and cooler assignment, temperature management and seal control, no uncontrolled custody breaks, logged transfer at lab handoff.

**Software requirements:**
- Digital CoC initiated at collection: container ID, outfall, parameter, collection time, sampler
- Cooler assignment with temperature logging
- Custody transfer logging: field sampler → runner/coordinator → lab, each with timestamp and signature
- Tamper seal number recorded at each transfer
- Lab receipt confirmation (from Mineral Labs or manual entry)
- Compromised sample detection: broken containers, wrong kits, elevated cooler temps, custody gaps → immediate escalation for review (not field normalization)
- System distinguishes between: qualified results (usable with qualifier), required resampling, and failure-to-sample exposure

#### Workflow 5: Lab Data Ingestion → Exceedance Detection (Manual §10)

**Software requirements (builds on existing parse-lab-data-edd EF):**
- Mineral Labs delivers 26-column EDD within 48 hours per ¶49
- System validates format, normalizes parameters (47 aliases → 21 canonical), fuzzy-matches outfall names
- Compares results against verified permit limits
- Auto-generates exceedances with severity classification
- Fires tiered alerts: email to Environmental Manager within 1 hour, SMS to Bill Johnson for severity ≥ HIGH
- Links exceedance to decree paragraph(s), applicable permit limit, corrective action template
- Tracks exceedance through resolution: detection → investigation → corrective action → verification → closure

#### Workflow 6: DMR Calculation → Submission (Manual §10, not yet built)

**Software requirements:**
- Monthly avg, daily max, daily min per outfall per parameter
- Below-detection handling per state rules (half-detection-limit for WV, varies by state)
- NODI codes: no discharge, below ML, conditional exemption, other
- Sample count validation: enough samples collected per frequency requirement?
- Draft → review (Environmental Manager) → approve (Bill Johnson or designee) → submit (human enters into state portal) → proof-of-submission evidence attached
- Comparison against historical ECHO DMR data for validation

#### Workflow 7: Governance Decision Routing (Manual §2, Governance Addendum)

**Every compliance-review issue must be logged with:**
- Issue type
- Decree paragraph(s) implicated
- Date and time raised
- Current owner
- Evidence attached
- Applicable deadline or notice requirement
- Final decision and disposition
- Escalation history

**Routing engine:**
1. Issue created (field event, lab result, system detection, or manual entry)
2. Auto-classified by type: exceedance, force majeure candidate, compromised sample, access issue, gray-area interpretation, deadline-sensitive decision
3. Routed to Bill Johnson (Step 1)
4. If unresolved after configurable SLA → escalated to Tom Lusk (Step 2)
5. If further escalation needed → Tom routes to President/CEO (Step 3) and/or Chief Counsel (Step 4)
6. Every state transition logged immutably with timestamp, actor, decision, evidence

---

## 4. Critical Gaps and Missing Questions

### Gaps the User Has Not Asked About

1. **No `field_events` table or mobile data model.** The current schema has `sampling_events` (19 cols, 66 rows) but no tables for: outlet inspections, no-discharge events, access issues, force majeure candidates, field measurements, custody transfers, equipment assignments, calibration logs, bottle kit tracking, safety check-ins, or route execution tracking. These are ~12 new tables minimum.

2. **No offline storage architecture.** The manual explicitly acknowledges field work happens outside cell coverage (§12: "often outside cell coverage"). There is no service worker, IndexedDB schema, conflict resolution strategy, or sync queue in the current build.

3. **No Runner/Coordinator role in the platform.** The `roles` table has 8 roles (Executive, Site Manager, Environmental Manager, Safety Manager, Field Sampler, Lab Tech, Admin, Read-Only). The manual defines a Runner/Coordinator as essential — bottle flow, sample transport, stocking, absence buffer. This role needs platform representation.

4. **No bottle/container tracking.** The manual (§5, §9) treats bottle kits as critical-path items. Wrong bottle = wrong preservative = compromised sample = missed compliance event. No table tracks bottle inventory, kit composition, preservative types, expiration dates, or container-to-outfall-to-parameter assignments.

5. **No training records in the database.** The manual (§4) requires training records as compliance artifacts: initial training, annual refresher, semiannual competency verification, supervisor sign-off. The current schema has no training-related tables.

6. **No equipment/calibration tracking.** The manual (§5) requires field meters with documented calibration, tablets with rugged cases, satellite communications. The current schema has no equipment inventory or calibration log tables.

7. **No staging facility tracking.** The manual (§5) requires secure staging with parking, freezer capacity, Wi-Fi, bottle receipt, lockable storage. No data model represents staging locations or their access control.

8. **No weather-hold or safety-hold logic.** The manual (§12) defines weather hold criteria and safety stops. No software enforces or tracks these.

9. **No ride-along / supervision tracking.** The manual (§7) requires periodic ride-alongs and data completeness reviews. No table captures supervisor oversight events.

10. **No document version control for the manual itself.** The manual (§13) states it must be a controlled document with approval, version tracking, and staff communication. No versioning system exists in the platform.

### Assumptions Requiring Confirmation

| # | Assumption | Risk if Wrong | Who Confirms |
|---|-----------|---------------|-------------|
| 1 | Mineral Labs will deliver EDDs in the 26-column format already validated | If they use a different format, parser needs rework | Bill Johnson |
| 2 | 313 monitored points is the correct WV count for launch planning | If higher, route timing and staffing assumptions break | Tom / Sampling Matrix |
| 3 | Field samplers will use tablets (not phones) | Affects UI design, screen real estate, photo capability | Tom |
| 4 | Satellite communicators (e.g., Garmin inReach) will be the offline safety fallback | Affects lone-worker check-in architecture | Tom |
| 5 | WVDEP does not require state-specific sampler certification beyond 40 CFR Part 136 | If certification required, launch timeline extends | Bill Johnson / Legal |
| 6 | Semi-monthly spacing means ≥15 calendar days between collections per outfall | If permit-specific language varies, calendar generator needs per-permit overrides | Permit verification |
| 7 | Short-hold parameters (bacteria, BOD) route before long-hold parameters | If lab delivery windows differ, route optimization changes | Mineral Labs confirmation |
| 8 | The runner/coordinator will have a company vehicle | If personal vehicle, insurance/liability and staging logistics change | Tom |
| 9 | One primary staging location (Beckley) + one satellite (West zone) | If Beckley-only, West zone miss risk increases per manual §5 | Tom |
| 10 | Bill Johnson has the authority to make same-day compliance decisions | If decisions require committee or counsel input every time, SLA-based escalation doesn't work | Bill Johnson |
| 11 | Mineral Labs will provide sample receipt confirmation electronically | If paper-only, custody chain has a digital gap | Mineral Labs |
| 12 | Lab holds are <7 days for standard parameters | If longer, the 48-hour result delivery per ¶49 applies to analysis completion, not receipt | Mineral Labs |
| 13 | The platform will not directly submit DMRs to state portals (human enters values) | If auto-submission wanted later, API integration with NetDMR/eDMR required | Tom / Bill Johnson |
| 14 | Backup lab strategy is needed before launch | If Mineral Labs loses certification or misses SLAs, who takes over? | Tom / Bill Johnson |

### Hidden Engineering / Compliance Risks

1. **Audit log immutability under database admin access.** The `audit_log` table has 10,409 entries and RLS enabled, but a Supabase project admin can still DELETE rows. For litigation defensibility, consider write-once external archival (Cloudflare R2 append-only bucket or Supabase pg_cron → R2 nightly export).

2. **Time zone handling across state boundaries.** WV is Eastern. If a sampler near the KY border collects at 11:45 PM ET on the last day of the month, but the timestamp is stored in UTC, the DMR calculation engine must correctly attribute it to the right month in the right time zone for the right state.

3. **Photo storage scale.** 313 outfalls × 2-4 photos per visit × monthly/semi-monthly × 12 months = 15,000–30,000 photos/year for WV alone. Storage bucket sizing and CDN strategy needed.

4. **Semi-monthly spacing enforcement edge cases.** What happens when: (a) a flood prevents access for 16 days, (b) a sampler collects on day 14 instead of day 15, (c) two samples collected same day for different parameters at same outfall? The calendar generator must handle all of these and log the reason for any spacing violation.

5. **Partial-month lab data.** If Mineral Labs delivers results for some parameters but not others (e.g., metals analysis takes longer than pH/TSS), the system must track partial-month completeness and not calculate DMR values prematurely.

6. **Parameter alias drift.** The Lab Data Import Spec documents 47 aliases for 21 parameters. If Mineral Labs introduces a new alias or changes naming convention, the parser rejects the file. Need a "new alias flagged for review" workflow, not silent rejection.

7. **Custody gap detection.** If there's a gap between "sampler handed off to runner" and "runner delivered to lab" with no logged event, that's a custody break. The system must detect and alert on gaps > configurable threshold (e.g., 2 hours with no custody event).

---

## 5. Major Design Decisions

### Decision 1: Field App Architecture — Native vs PWA vs React Native

**Issue:** Field samplers need a tablet/phone app that works offline in remote WV locations, captures GPS/photos, records structured field data, and syncs when connectivity returns.

**Options:**

| Option | Compliance | Field Usability | Engineering Effort | Time to Ship | Scale | Reliability |
|--------|-----------|----------------|-------------------|-------------|-------|-------------|
| **A: Progressive Web App (PWA)** | Adequate — Service Worker + IndexedDB | Good — works on any tablet/phone browser | Low — reuses React/TS stack | 4–6 weeks | High — one codebase | Medium — browser storage limits, iOS PWA restrictions |
| **B: React Native** | Strong — native storage, background sync | Excellent — native feel, better GPS/camera | High — new codebase, new build pipeline | 10–14 weeks | High — iOS + Android | High — native APIs, better offline |
| **C: Native (Swift + Kotlin)** | Strongest — full OS control | Best — perfect hardware integration | Very High — two codebases | 16–20 weeks | Medium — two maintenance burdens | Highest |
| **D: Capacitor (Ionic) wrapping existing React** | Adequate — native bridge for camera/GPS | Good — native shell, web core | Medium — bridge setup, testing | 6–8 weeks | High — one core codebase | Medium-High — native storage access |

**Chosen direction: Option A (PWA) for MVP launch, with Option D (Capacitor) as Phase 2 upgrade if PWA limitations bite.**

**Why it wins:** The WV launch is time-constrained. The existing React/TypeScript stack means PWA development is incremental, not greenfield. Service Workers + IndexedDB provide adequate offline capability for structured data capture. Photos can be stored in IndexedDB as blobs and synced via the existing file-upload-handler EF. GPS works via the browser Geolocation API. The critical limitation — iOS Safari Service Worker eviction after 7 days — is manageable because samplers sync daily. If field testing reveals PWA limitations (storage caps, background sync issues), Capacitor wraps the same React code in a native shell with full native API access in Phase 2. This avoids the 10–20 week delay of native development while keeping the upgrade path open.

### Decision 2: Offline Sync Strategy — Last-Write-Wins vs CRDT vs Queue-Based

**Issue:** Multiple samplers collecting data simultaneously, syncing at different times, potentially visiting the same outfall (runner/sampler overlap). How do we resolve conflicts?

**Options:**

| Option | Compliance | Reliability | Effort | Audit Trail |
|--------|-----------|-------------|--------|-------------|
| **A: Queue-based (append-only local, server reconciles)** | Strong — no local overwrites | High — no data loss | Low | Perfect — every event preserved |
| **B: Last-write-wins** | Weak — silent overwrites lose data | Medium | Very Low | Poor — overwritten data gone |
| **C: CRDT (Conflict-free Replicated Data Types)** | Strong | Highest | Very High | Good but complex |
| **D: Manual conflict resolution UI** | Strong | High | Medium | Good — human decides |

**Chosen direction: Option A (queue-based append-only).**

**Why it wins:** In a compliance system, data loss is unacceptable. Field events are naturally append-only — a sampler visits an outfall and records what happened. There's no legitimate case for overwriting someone else's field record. The local device queues events with timestamps and sampler ID. On sync, the server accepts all events and reconciles by timestamp order. If the same outfall has two events from two people (rare edge case — runner and sampler both visited), the server flags both for supervisor review rather than silently picking one. This is the only strategy where the audit trail is guaranteed complete under all network conditions.

### Decision 3: Governance Decision Engine — Workflow Engine vs State Machine vs Simple Routing

**Issue:** Every compliance-review issue must follow the locked governance path with logged decisions, deadlines, and evidence. How complex should the routing engine be?

**Options:**

| Option | Compliance | Flexibility | Effort | Maintenance |
|--------|-----------|-------------|--------|-------------|
| **A: Lightweight state machine** (issue → statuses + transitions + routing rules in DB) | Strong | Medium — new issue types require migration | Low–Medium | Low |
| **B: Full workflow engine** (BPMN-style, configurable) | Overkill | Very High | Very High | High |
| **C: Simple routing table** (issue type → Step 1 owner, SLA, escalation rules) | Adequate for WV | Low — hardcoded paths | Low | Low |

**Chosen direction: Option A (lightweight state machine).**

**Why it wins:** The governance path is fixed and locked (Bill Johnson → Tom Lusk → President/CEO → Chief Counsel). A full BPMN engine is massive overkill. But a simple routing table can't handle: SLA-based auto-escalation, multi-step decisions with different outcomes, evidence attachment at each step, or future state expansion (different governance chains per state). A state machine with transitions stored in the database gives us: configurable issue types, deadline-driven escalation, immutable transition history, and per-state override capability without rebuilding. The tables needed: `governance_issue_types`, `governance_issues`, `governance_transitions`, `governance_escalation_rules`.

### Decision 4: Sampling Calendar Generation — Static vs Dynamic vs Hybrid

**Issue:** 313 WV outfalls need sampling dates generated from permit frequency rules (2/month, 1/quarter, etc.) with semi-monthly spacing enforcement, rain-event logic, and short-hold parameter prioritization.

**Options:**

| Option | Compliance | Field Usability | Handling Exceptions | Effort |
|--------|-----------|----------------|-------------------|--------|
| **A: Static generation** (generate full month/quarter calendar upfront, manual adjustments) | Good if managed | Good — predictable routes | Poor — weather/access changes require manual rebuilds | Low |
| **B: Dynamic generation** (recalculate daily based on what's been collected and what's due) | Strongest — always current | Medium — routes may shift daily | Excellent — auto-adjusts | Medium–High |
| **C: Hybrid** (static base calendar generated monthly, dynamic adjustments for exceptions) | Strong | Best — stable baseline with flex | Good — planned + reactive | Medium |

**Chosen direction: Option C (hybrid).**

**Why it wins:** Field samplers need predictable routes they can plan around (fuel, drive time, bottle prep). A fully dynamic system that reshuffles routes daily creates chaos. But a fully static system can't handle: rain events requiring grab samples, access issues that delay collection, force majeure events that void a week of collection. The hybrid approach generates a monthly base calendar from permit schedules, assigns outfalls to zones and routes, and then allows exception-driven adjustments (weather hold, access block, makeup collection) that are tracked and justified. The `sampling_calendar` table already exists with the right structure — it needs population logic and an adjustment/override mechanism.

### Decision 5: Photo Evidence Storage — Supabase Storage vs Cloudflare R2 Direct vs Hybrid

**Issue:** High volume of field photos (15,000–30,000/year for WV alone), used as legal evidence, must be retained long-term with integrity verification.

**Chosen direction: Supabase Storage for hot access (< 90 days), Cloudflare R2 for cold archival (> 90 days), SHA-256 hash on upload for tamper detection.**

**Why:** Supabase Storage integrates with RLS for access control. R2 is cheaper for long-term storage and already provisioned (`scc-compliance-archive` bucket exists). Photo hash on upload creates tamper-evident chain — if a photo is ever questioned, the hash at upload time proves it hasn't been modified. Automatic lifecycle policy moves photos from Supabase to R2 after 90 days with hash verification.

---

## 6. Full Product Architecture

### Module Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    FIELD OPERATIONS LAYER                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  Route    │ │  Outfall │ │  Sample  │ │  Safety  │           │
│  │  Manager  │ │  Visit   │ │  Capture │ │  Check-in│           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  No-     │ │  Force   │ │  Access  │ │  Chain of│           │
│  │ Discharge│ │  Majeure │ │  Issue   │ │  Custody │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────────────────────────────────┐                       │
│  │  Offline Queue + Sync Engine         │                       │
│  └──────────────────────────────────────┘                       │
├─────────────────────────────────────────────────────────────────┤
│                    DATA INGESTION LAYER (EXISTS)                 │
│  Upload Dashboard │ Permit Parser │ Lab EDD Parser │ ECHO Sync  │
├─────────────────────────────────────────────────────────────────┤
│                    COMPLIANCE ENGINE LAYER                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Calendar │ │ Exceedance│ │  DMR     │ │ Penalty  │           │
│  │Generator │ │ Detector │ │ Calc     │ │Calculator│           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
├─────────────────────────────────────────────────────────────────┤
│                    GOVERNANCE LAYER                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Decision │ │Escalation│ │ Evidence │ │ Deadline │           │
│  │ Router   │ │ Engine   │ │ Chain    │ │ Monitor  │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
├─────────────────────────────────────────────────────────────────┤
│                    REPORTING & SUBMISSION LAYER                  │
│  DMR Generator │ Quarterly Report │ Proof-of-Submission │ Export│
├─────────────────────────────────────────────────────────────────┤
│                    MANAGEMENT LAYER (PARTIAL)                    │
│  Executive Dashboard │ Obligation Tracker │ Audit Trail Viewer  │
├─────────────────────────────────────────────────────────────────┤
│                    OPERATIONS SUPPORT LAYER                      │
│  Training/Competency │ Equipment/Calibration │ Bottle Management│
└─────────────────────────────────────────────────────────────────┘
```

### New Database Tables Required

These tables must be created as migrations, not modifications to existing tables:

```sql
-- FIELD OPERATIONS (12 new tables)

-- 1. Outlet inspections (one per outfall visit)
CREATE TABLE outlet_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sampling_event_id uuid REFERENCES sampling_events(id),
  outfall_id uuid NOT NULL REFERENCES outfalls(id),
  inspected_by uuid REFERENCES user_profiles(id),
  inspected_at timestamptz NOT NULL,
  signage_present boolean,
  pipe_condition text, -- good/damaged/missing/obstructed
  flow_status text NOT NULL, -- flowing/no_flow/intermittent/inaccessible
  erosion_observed boolean,
  obstruction_observed boolean,
  obstruction_description text,
  gps_latitude numeric(10,7),
  gps_longitude numeric(10,7),
  gps_accuracy_meters numeric(6,2),
  notes text,
  photos jsonb DEFAULT '[]', -- array of storage paths
  synced_at timestamptz, -- null = pending sync
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. No-discharge events (legally sensitive)
CREATE TABLE no_discharge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_inspection_id uuid NOT NULL REFERENCES outlet_inspections(id),
  outfall_id uuid NOT NULL REFERENCES outfalls(id),
  documented_by uuid REFERENCES user_profiles(id),
  event_date date NOT NULL,
  observed_condition text NOT NULL, -- narrative
  photo_evidence jsonb NOT NULL DEFAULT '[]', -- MUST have ≥1 photo
  obstruction_present boolean NOT NULL DEFAULT false,
  obstruction_description text,
  alternate_explanation text,
  documentation_complete boolean NOT NULL DEFAULT false,
  nodi_code text, -- maps to DMR NODI
  supervisor_reviewed boolean DEFAULT false,
  supervisor_reviewed_by uuid REFERENCES user_profiles(id),
  supervisor_reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 3. Access issues
CREATE TABLE access_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outfall_id uuid NOT NULL REFERENCES outfalls(id),
  reported_by uuid REFERENCES user_profiles(id),
  reported_at timestamptz NOT NULL,
  issue_type text NOT NULL, -- gate_locked/road_blocked/unsafe/permission_denied/other
  description text NOT NULL,
  photos jsonb DEFAULT '[]',
  contact_attempted boolean DEFAULT false,
  contact_name text,
  contact_result text,
  escalation_step int DEFAULT 1, -- 1=superintendent, 2=engineering/mgmt, 3=program leadership
  governance_issue_id uuid, -- links to governance_issues if escalated
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz DEFAULT now()
);

-- 4. Force majeure candidates
CREATE TABLE force_majeure_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_by uuid REFERENCES user_profiles(id),
  reported_at timestamptz NOT NULL,
  event_type text NOT NULL, -- flood/storm/equipment_failure/road_closure/other
  description text NOT NULL,
  affected_outfalls jsonb NOT NULL DEFAULT '[]', -- array of outfall_ids
  evidence_photos jsonb DEFAULT '[]',
  notice_deadline_3bd timestamptz NOT NULL, -- 3 business days from first knowledge
  written_deadline_7cd timestamptz NOT NULL, -- 7 calendar days from first knowledge
  notice_sent boolean DEFAULT false,
  notice_sent_at timestamptz,
  written_explanation_sent boolean DEFAULT false,
  written_explanation_sent_at timestamptz,
  governance_issue_id uuid, -- links to governance_issues
  determination text, -- pending/approved/denied
  determined_by uuid REFERENCES user_profiles(id),
  determined_at timestamptz,
  decree_paragraphs text[], -- which CD paragraphs apply
  created_at timestamptz DEFAULT now()
);

-- 5. Chain of custody records
CREATE TABLE custody_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sampling_event_id uuid REFERENCES sampling_events(id),
  container_id text NOT NULL,
  outfall_id uuid NOT NULL REFERENCES outfalls(id),
  parameter_id uuid REFERENCES parameters(id),
  preservative_type text,
  collection_time timestamptz NOT NULL,
  collected_by uuid REFERENCES user_profiles(id),
  cooler_id text,
  cooler_temperature numeric(5,2),
  seal_number text,
  created_at timestamptz DEFAULT now()
);

-- 6. Custody transfers (chain of handoffs)
CREATE TABLE custody_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custody_record_id uuid NOT NULL REFERENCES custody_records(id),
  transferred_from uuid REFERENCES user_profiles(id),
  transferred_to uuid REFERENCES user_profiles(id),
  transferred_to_lab boolean DEFAULT false,
  lab_name text,
  transfer_time timestamptz NOT NULL,
  cooler_temperature_at_transfer numeric(5,2),
  seal_intact boolean,
  notes text,
  signature_captured boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 7. Field measurements (pH, temp, conductivity in field)
CREATE TABLE field_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sampling_event_id uuid NOT NULL REFERENCES sampling_events(id),
  outfall_id uuid NOT NULL REFERENCES outfalls(id),
  parameter_id uuid NOT NULL REFERENCES parameters(id),
  measured_by uuid REFERENCES user_profiles(id),
  measured_at timestamptz NOT NULL,
  value numeric(12,4),
  unit text NOT NULL,
  meter_serial_number text,
  calibration_log_id uuid, -- references calibration_logs
  created_at timestamptz DEFAULT now()
);

-- 8. Compromised samples
CREATE TABLE compromised_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sampling_event_id uuid REFERENCES sampling_events(id),
  custody_record_id uuid REFERENCES custody_records(id),
  reported_by uuid REFERENCES user_profiles(id),
  reported_at timestamptz NOT NULL,
  issue_type text NOT NULL, -- broken_container/wrong_kit/elevated_temp/custody_break/other
  description text NOT NULL,
  photos jsonb DEFAULT '[]',
  determination text DEFAULT 'pending', -- pending/qualified/resample_required/failure_to_sample
  determined_by uuid REFERENCES user_profiles(id),
  determined_at timestamptz,
  governance_issue_id uuid,
  created_at timestamptz DEFAULT now()
);

-- GOVERNANCE (4 new tables)

-- 9. Governance issue types
CREATE TABLE governance_issue_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  default_step1_role text DEFAULT 'chief_compliance_officer',
  default_sla_hours int DEFAULT 24,
  requires_decree_paragraph boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 10. Governance issues (the core routing table)
CREATE TABLE governance_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_type_id uuid NOT NULL REFERENCES governance_issue_types(id),
  title text NOT NULL,
  description text,
  decree_paragraphs text[],
  source_type text, -- exceedance/force_majeure/compromised_sample/access_issue/manual
  source_id uuid, -- polymorphic reference
  current_step int NOT NULL DEFAULT 1,
  current_owner uuid REFERENCES user_profiles(id),
  status text NOT NULL DEFAULT 'open', -- open/pending_decision/escalated/resolved/closed
  deadline timestamptz,
  evidence jsonb DEFAULT '[]',
  final_decision text,
  final_decided_by uuid REFERENCES user_profiles(id),
  final_decided_at timestamptz,
  created_by uuid REFERENCES user_profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 11. Governance transitions (immutable log)
CREATE TABLE governance_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  governance_issue_id uuid NOT NULL REFERENCES governance_issues(id),
  from_step int,
  to_step int NOT NULL,
  from_owner uuid REFERENCES user_profiles(id),
  to_owner uuid REFERENCES user_profiles(id),
  action text NOT NULL, -- created/assigned/escalated/decided/closed/comment
  decision text,
  notes text,
  evidence_attached jsonb DEFAULT '[]',
  acted_by uuid NOT NULL REFERENCES user_profiles(id),
  acted_at timestamptz NOT NULL DEFAULT now()
);

-- 12. Governance escalation rules
CREATE TABLE governance_escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text REFERENCES states(code),
  issue_type_id uuid REFERENCES governance_issue_types(id),
  step int NOT NULL,
  role_name text NOT NULL,
  default_owner uuid REFERENCES user_profiles(id),
  sla_hours int NOT NULL DEFAULT 24,
  auto_escalate boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(state_code, issue_type_id, step)
);

-- OPERATIONS SUPPORT (6 new tables)

-- 13. Training records
CREATE TABLE training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id),
  training_type text NOT NULL, -- initial/annual_refresher/semiannual_competency/supervisor_signoff
  training_track text NOT NULL, -- consent_decree/permit_matrix/outlet_inspection/no_discharge/etc
  completed_date date NOT NULL,
  expires_date date,
  trainer_name text,
  verified_by uuid REFERENCES user_profiles(id),
  verification_method text, -- written_test/observation/ride_along/task_signoff
  verification_date date,
  passed boolean,
  certificate_path text, -- storage path
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 14. Equipment inventory
CREATE TABLE equipment_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_type text NOT NULL, -- tablet/field_meter/cooler/satellite_comm/vehicle
  make text,
  model text,
  serial_number text,
  assigned_to uuid REFERENCES user_profiles(id),
  assigned_zone text,
  status text DEFAULT 'active', -- active/maintenance/retired
  purchase_date date,
  warranty_expiry date,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 15. Calibration logs
CREATE TABLE calibration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES equipment_inventory(id),
  calibrated_by uuid REFERENCES user_profiles(id),
  calibrated_at timestamptz NOT NULL,
  parameter text NOT NULL, -- pH/conductivity/temperature
  standard_value numeric(12,4),
  measured_value numeric(12,4),
  passed boolean NOT NULL,
  buffer_lot_number text,
  expiry_date date,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 16. Bottle kit tracking
CREATE TABLE bottle_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_identifier text NOT NULL UNIQUE,
  kit_type text NOT NULL, -- standard/bacteria/metals/wet_test
  parameters jsonb NOT NULL, -- array of parameter names + preservative types
  container_count int NOT NULL,
  received_date date,
  expiry_date date,
  assigned_to_route text,
  assigned_to_outfall uuid REFERENCES outfalls(id),
  status text DEFAULT 'available', -- available/assigned/in_field/at_lab/consumed/expired
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 17. Safety check-ins
CREATE TABLE safety_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id),
  checkin_type text NOT NULL, -- start_of_day/midpoint/end_of_day/emergency/weather_hold
  checkin_time timestamptz NOT NULL,
  gps_latitude numeric(10,7),
  gps_longitude numeric(10,7),
  method text NOT NULL, -- app/satellite/phone/radio
  notes text,
  acknowledged_by uuid REFERENCES user_profiles(id),
  acknowledged_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 18. Offline sync queue (device-side events awaiting server reconciliation)
CREATE TABLE sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  user_id uuid REFERENCES user_profiles(id),
  event_type text NOT NULL,
  event_data jsonb NOT NULL,
  event_timestamp timestamptz NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz,
  sync_status text DEFAULT 'pending', -- pending/synced/conflict/error
  conflict_resolution text,
  server_record_id uuid,
  created_at timestamptz DEFAULT now()
);
```

### Automation and Decision Engine

**Auto-generated events (no human trigger needed):**
- Sampling calendar entries from permit schedules (monthly generation)
- Exceedance detection on lab data import
- Force majeure deadline calculation on candidate creation
- SLA-based governance escalation
- Overdue sampling alerts (calendar entries past due date)
- Custody gap detection (>2 hour gap between transfers)
- Calibration expiry warnings (7 days before expiry)
- Training renewal reminders (30 days before expiry)
- Lab result late detection (>48 hours since sample delivery, no EDD received)

**Requires human decision (cannot automate):**
- Force majeure determination (Bill Johnson)
- Compromised sample ruling (Bill Johnson)
- Exceedance corrective action assignment
- DMR approval for submission
- Any governance Step 2+ escalation resolution
- Access issue resolution involving mine superintendents
- Permit limit verification (AI-extracted → human-confirmed)

### Notification Architecture

| Event | Channel | Recipient | Timing |
|-------|---------|-----------|--------|
| Exceedance detected | Email + In-app | Environmental Manager (WV) | Within 1 hour of lab import |
| Exceedance severity HIGH+ | SMS + Email | Bill Johnson | Immediately |
| Force majeure candidate created | SMS + Email | Bill Johnson | Immediately |
| Force majeure 3BD notice deadline approaching | SMS + Email | Bill Johnson, Tom Lusk | 24 hours before deadline |
| Governance issue SLA expiring | Email | Current owner + next escalation level | 4 hours before SLA |
| Sampling event overdue | In-app | Field Sampler + WV Supervisor | Day of due date |
| Lab results late (>48hr) | Email | WV Supervisor, Bill Johnson | At 48-hour mark |
| Custody gap detected | In-app + Email | WV Supervisor | On detection |
| Calibration expiring | In-app | Field Sampler | 7 days before |
| Training renewal due | Email | Employee + WV Supervisor | 30 days before |
| Safety check-in missed | SMS + Email | WV Supervisor, Tom Lusk | 30 minutes after expected check-in |
| DMR draft ready for review | In-app + Email | Environmental Manager | On generation |
| Quarterly report deadline approaching | Email | Bill Johnson, Tom Lusk | 14 days before |

---

## 7. Mineral Labs Integration Spec

### Data Contract

Mineral Labs is the contracted analytical laboratory for the WV in-house sampling program. This specification defines exactly what data, format, timing, and quality Mineral Labs must deliver.

### Required File Format

**Format:** 26-column Electronic Data Deliverable (EDD), CSV or Excel (.xlsx)

**Encoding:** UTF-8

**Date format:** MM/DD/YYYY

**Time format:** HH:MM (24-hour)

**Delimiter (CSV):** Comma

**Column specification (must match exactly):**

| Col | Header (exact) | Type | Required | Notes |
|-----|---------------|------|----------|-------|
| 1 | Permittee Name | text | Y | Must match SCC subsidiary name |
| 2 | Permitee Address | text | N | |
| 3 | Permitee City | text | N | |
| 4 | Permitee State | text | Y | WV |
| 5 | Permit# | text | Y | Must match NPDES permit number exactly |
| 6 | Permit Type | text | Y | Individual or General |
| 7 | SMCRA # | text | N | |
| 8 | Site #/Name | text | Y | |
| 9 | Site City | text | N | |
| 10 | Site State | text | Y | |
| 11 | Site County | text | N | |
| 12 | Company Sampling/Analyzing | text | Y | Lab name |
| 13 | Responsible Party | text | Y | Person who collected the sample |
| 14 | Sample Location Name | text | Y | Must match outfall number/name in platform |
| 15 | Sample Location Latitude | decimal | N | |
| 16 | Sample Location Longitude | decimal | N | |
| 17 | Named Stream | text | N | |
| 18 | Sample Location Type | text | N | |
| 19 | Sample Date FLD | date | Y | MM/DD/YYYY — the date the sample was collected |
| 20 | Sample Time FLD | time | Y | HH:MM — the time the sample was collected |
| 21 | Date Analyzed | date | Y | MM/DD/YYYY — for hold-time compliance calculation |
| 22 | Parameter | text | Y | Must match a known parameter or alias |
| 23 | Value | numeric | Y | Use `<` prefix for below-detection (e.g., `<0.5`) |
| 24 | Units | text | Y | mg/L, ug/L, s.u., mL/L, NTU, etc. |
| 25 | Data Qualifier | text | N | `<` for below detection, `J` for estimated, `>` for above range |
| 26 | Comments | text | N | Lab notes, QC flags |

### File Naming Convention

```
SCC_EDD_{PermitNumber}_{YYYYMMDD}_{BatchID}.csv
```

Example: `SCC_EDD_WV0093521_20260415_001.csv`

If multiple permits in one file: `SCC_EDD_BATCH_{YYYYMMDD}_{BatchID}.csv`

### Timing / SLA Requirements

| Requirement | SLA | CD Basis | Consequence of Breach |
|------------|-----|----------|----------------------|
| **All DMR sample results transmitted** | Within 48 hours of analysis completion | ¶49 | Platform flags as late; Bill Johnson notified; potential force majeure exposure if results needed for reporting |
| **Exceedance notification** | Same business day as exceedance identification | Best practice / ¶49 spirit | Platform can detect from EDD, but lab must not sit on known exceedances |
| **Sample receipt confirmation** | Within 24 hours of physical receipt | Operational | Custody chain gap if not confirmed |
| **Corrected file delivery** | Within 24 hours of correction request | Operational | Original file retained; corrected file imported with correction audit trail |
| **Monthly EDD completeness** | All samples analyzed and delivered by 5th business day of following month | DMR deadline dependency | Late lab data = late DMR = potential violation |

### Exceedance Notification Requirements

Mineral Labs must notify SCC **same business day** when any analytical result exceeds a permit limit. Notification must include:

- Permit number
- Outfall number
- Parameter name
- Result value and unit
- Applicable permit limit (if known to lab)
- Analysis date
- Contact: Bill Johnson (email: bill.johnson@bluestone-coal.com) and WV Field Supervisor

This notification is **in addition to** the standard EDD delivery. The platform will independently detect exceedances from EDD import, but same-day lab notification provides an early warning buffer.

### Corrected-File Handling

When Mineral Labs identifies an error in a previously delivered EDD:

1. Mineral Labs delivers a corrected file with filename suffix `_CORRECTED_v{N}` (e.g., `SCC_EDD_WV0093521_20260415_001_CORRECTED_v1.csv`)
2. The platform retains the original file and all original records (immutable)
3. The corrected file is imported as a new `data_imports` record with `correction_of` reference to the original import
4. Changed values are logged in `data_corrections` with old value, new value, reason, and who initiated
5. Any exceedances generated from original data are rechecked against corrected data
6. DMR calculations affected by the correction are flagged for re-review

### QC Fields and Qualifiers

| Qualifier | Meaning | Platform Handling |
|-----------|---------|-------------------|
| `<` | Below detection limit | Value stored as detection limit; `below_detection = true`; DMR calculation uses state-specific rule (WV: half detection limit) |
| `>` | Above instrument range | Flagged for review; may indicate dilution needed |
| `J` | Estimated value | Value used but flagged as estimated in lab_results; noted on DMR if applicable |
| `B` | Detected in blank | Flagged for QC review; may invalidate result |
| `R` | Rejected | Result not used; flagged as requiring resampling |
| (blank) | No qualifier | Normal result |

### Certification Requirements

- Mineral Labs must maintain WV DEP laboratory certification for all parameters analyzed
- Certification number and expiry date must be on file in the platform
- Platform will alert 60 days before certification expiry
- If certification lapses, all results from the uncertified period are flagged

### Responsibilities Split

| Responsibility | Owner | Notes |
|---------------|-------|-------|
| Sample collection | SCC field team | In-house samplers |
| Chain of custody (collection → lab door) | SCC field team + runner | Digital CoC in platform |
| Sample receipt and condition check | Mineral Labs | Confirm receipt, note any condition issues |
| Analysis per 40 CFR Part 136 | Mineral Labs | Maintain certification |
| EDD delivery within 48 hours | Mineral Labs | Per ¶49 |
| Exceedance same-day notification | Mineral Labs | Email to Bill Johnson + WV Supervisor |
| Corrected file delivery | Mineral Labs | Within 24 hours of correction request |
| Hold-time compliance | Shared | SCC delivers within hold time; lab analyzes within hold time |
| QC documentation (method blanks, duplicates, spikes) | Mineral Labs | Available on request for audit |
| Lab data validation in platform | SCC / Platform | Auto-validation on import |

---

## 8. Ordered Engineering Roadmap

### Phase 0: Schema Migration & Governance Foundation (Week 1–2)

**Goal:** Create all new database tables, seed governance data, and establish the data model for everything that follows.

**Why now:** Every subsequent phase depends on these tables existing. No field app, no governance routing, no calendar generation can be built without the schema in place.

**Scope:**
- Create migration with all 18 new tables defined in Section 6
- Add `runner_coordinator` to the `roles` table
- Seed `governance_issue_types` with: exceedance, force_majeure, compromised_sample, access_issue, gray_area_interpretation, deadline_sensitive_decision
- Seed `governance_escalation_rules` for WV with the locked 4-step chain
- Apply RLS policies for all new tables (org-scoped SELECT for authenticated users, INSERT for appropriate roles)
- Add foreign key from `governance_issues` to existing tables (`exceedances`, `force_majeure_candidates`, `compromised_samples`, `access_issues`)

**Dependencies:** None — pure schema work.

**Acceptance criteria:**
- All 18 tables created with correct columns, types, constraints, and foreign keys
- RLS enabled and policies applied on all new tables
- Governance seed data matches the locked Governance Addendum exactly
- Existing tables and Edge Functions are not modified
- Migration is reversible

**Risks:** Migration complexity with 18 tables. Mitigate by applying as a single transaction with rollback.

**Output:** Migration SQL file, updated schema documentation.

---

### Phase 1: Sampling Calendar & Route Engine (Week 2–4)

**Goal:** Generate sampling schedules from permit data, assign outfalls to zones/routes, enforce semi-monthly spacing and short-hold prioritization.

**Why now:** The field app needs routes to display. The management dashboard needs a calendar to monitor. Nothing in the field operations layer works without a populated `sampling_calendar`.

**Scope:**
- Build Edge Function `generate-sampling-calendar` that:
  - Reads `sampling_schedules` + `permit_limits` + `outfalls` for a given state/month
  - Generates `sampling_calendar` entries per outfall per parameter per frequency
  - Enforces semi-monthly spacing (≥15 days between collections)
  - Prioritizes short-hold parameters (bacteria: 6hr, BOD: 48hr) earlier in route
  - Assigns outfalls to zones (North/Central/West per manual §6)
  - Accounts for known access issues (flagged outfalls get alternate scheduling)
- Build route optimization logic: zone → daily route → drive-time estimates
- Build UI: Sampling Calendar page with month view, zone filtering, route preview
- Build schedule override mechanism: weather hold, access block, makeup collection
- Populate `sampling_schedules` from verified permit limits (blocked until 3.05 verification — build logic first, populate when data is verified)

**Dependencies:** Phase 0 complete. Permit limits must be verified (3.05) before real calendar generation — build against test data first.

**Acceptance criteria:**
- Calendar generates correct dates for 2/month, 1/month, 1/quarter frequencies
- Semi-monthly spacing is enforced (rejects <15 day gaps)
- Short-hold parameters appear first in daily route sequence
- Override/adjustment creates audit log entry with reason
- Route zone assignments match manual §6 geographic zones

**Risks:** Without verified permit limits, calendars are generated from AI-extracted data. Mitigate: build against a test subset of manually verified permits first.

**Output:** generate-sampling-calendar EF, SamplingCalendarPage.tsx, route display components.

---

### Phase 2: Field Event Capture — Core Mobile App (Week 3–6)

**Goal:** Build the PWA field application that samplers use on tablets to execute routes, record outfall visits, capture samples/no-discharge events, and manage chain of custody.

**Why now:** This is the highest-value new capability. Without it, the in-house program launches on paper, and the evidence chain is broken from day one.

**Scope:**

**2A. Offline Architecture (Week 3)**
- Implement Service Worker for offline caching of app shell + route data
- Implement IndexedDB schema mirroring the 18 new tables
- Build sync engine: queue events locally → batch upload on connectivity → server reconciliation
- Build conflict detection: flag same-outfall/same-day events from different devices
- Implement photo capture with offline blob storage in IndexedDB

**2B. Route Execution UI (Week 3–4)**
- Daily route view: ordered list of outfalls with map, estimated drive time, status (pending/complete/skipped)
- Outfall arrival: GPS auto-capture, location confirmation prompt, distance-from-expected check
- Navigation: link to device mapping app for driving directions

**2C. Outfall Visit Recording (Week 4–5)**
- Outlet inspection form: signage, pipe condition, flow status, erosion, obstruction (writes to `outlet_inspections`)
- Sample capture: parameter selection, field meter readings, container ID, preservative confirmation (writes to `sampling_events`, `field_measurements`, `custody_records`)
- No-discharge documentation: photo required (enforced — cannot submit without photo), narrative, condition description (writes to `no_discharge_events`)
- Access issue reporting: photo, description, contact attempted, escalation initiated (writes to `access_issues`)
- Force majeure flagging: event type, description, affected outfalls, evidence photos (writes to `force_majeure_candidates`, auto-calculates deadlines)

**2D. Chain of Custody (Week 5–6)**
- Container-to-outfall-to-parameter assignment at collection
- Cooler assignment with temperature logging
- Transfer recording: sampler → runner, runner → lab
- Seal number tracking
- Compromised sample reporting with photo evidence

**2E. Safety Check-ins (Week 5–6)**
- Start-of-day, midpoint, end-of-day structured check-ins
- GPS + timestamp on each check-in
- Missed check-in alert to WV Supervisor (30-minute threshold)
- Weather hold recording
- Emergency contact integration

**Dependencies:** Phase 0 complete, Phase 1 in progress (route data needed for display).

**Acceptance criteria:**
- All field forms work fully offline (airplane mode test)
- Photos captured offline and synced correctly when connectivity returns
- GPS coordinates captured at ≤10m accuracy
- No-discharge event cannot be completed without photo
- Force majeure candidate auto-calculates 3BD and 7CD deadlines correctly
- Chain of custody tracks every transfer with no gaps
- Safety check-in missed alert fires within 30 minutes
- Sync handles 50+ queued events without data loss
- All events create audit log entries on server sync

**Risks:** PWA offline storage limits (~50MB on Safari). Mitigate: compress photos before storage, limit to 3 photos per event, sync aggressively when connectivity available.

**Output:** FieldApp PWA, all field capture components, offline sync engine.

---

### Phase 3: Governance Decision Engine (Week 4–6)

**Goal:** Implement the locked governance escalation chain with decision routing, deadline monitoring, and immutable audit trail.

**Why now:** Force majeure candidates, compromised samples, and exceedances from Phases 1-2 need a routing destination. Without governance routing, compliance-review issues have no workflow.

**Scope:**
- Build governance issue creation (auto from exceedances, force majeure, compromised samples; manual for gray areas)
- Build routing engine: lookup `governance_escalation_rules` → assign to Step 1 owner (Bill Johnson for WV)
- Build SLA monitoring: check `governance_issues` open duration vs `sla_hours` → auto-escalate to next step
- Build decision recording: current owner records decision with evidence → writes to `governance_transitions`
- Build governance dashboard: Bill Johnson sees all open issues, grouped by type, sorted by deadline urgency
- Build Tom Lusk escalation view: only sees issues escalated to Step 2+
- Build decree paragraph linkage: every governance issue must reference applicable CD paragraphs
- Build notification triggers: new issue → owner notified, SLA approaching → warning, auto-escalation → both levels notified

**Dependencies:** Phase 0 (governance tables), Phase 2 (field events that create governance issues).

**Acceptance criteria:**
- New exceedance auto-creates governance issue routed to Bill Johnson
- Force majeure candidate auto-creates governance issue with countdown timers
- Issue not acted on within SLA auto-escalates to Tom Lusk
- Every state transition logged in `governance_transitions` with actor, timestamp, decision, evidence
- Bill Johnson governance dashboard shows all open WV issues
- Decree paragraph field required on all compliance-related issue types

**Output:** GovernanceEngine service, GovernanceDashboard.tsx, issue routing logic, notification integrations.

---

### Phase 4: DMR Calculation Engine (Week 5–8)

**Goal:** Build the computational core that calculates DMR values from lab results per state-specific rules.

**Why now:** This is the acceptance test (task 3.11). Until DMR calculations match actual historical submissions, the platform cannot be trusted for compliance.

**Scope:**
- Build DMR calculation Edge Function `calculate-dmr` that:
  - Accepts: permit_id, outfall_id, monitoring_period (month/quarter), parameters
  - Reads all `lab_results` for the period
  - Calculates monthly average, daily maximum, daily minimum per parameter
  - Handles below-detection values per state rule (WV: half detection limit)
  - Handles NODI codes: no discharge, below ML, conditional exemption
  - Handles sample count validation (minimum samples per frequency)
  - Writes results to `dmr_line_items`
- Build state-specific calculation rules engine (parameterized, not hardcoded for WV)
- Build DMR review/approve/submit workflow UI
- Build comparison tool: system-calculated DMR vs historical ECHO DMR for validation
- Build proof-of-submission attachment workflow

**Dependencies:** Lab results in database (771 exist), verified permit limits (blocked on 3.05), historical DMR data for validation (blocked on task 1.27).

**Acceptance criteria:**
- DMR calculations for test permits match historical ECHO DMR values within rounding tolerance
- Below-detection handling produces correct values per WV rules
- NODI codes correctly applied for no-discharge outfalls
- Sample count validation catches under-sampled outfalls
- DMR review workflow: draft → Environmental Manager review → Bill Johnson approve → submit
- Every DMR state transition logged in audit trail

**Risks:** Cannot complete acceptance test (3.11) without historical DMR submissions from Tom. Build engine against ECHO data first; final validation requires actual NetDMR/eDMR submissions.

**Output:** calculate-dmr EF, DmrWorkflowPage.tsx, validation comparison tool.

---

### Phase 5: Lab Integration Hardening & Exceedance Pipeline (Week 6–8)

**Goal:** Formalize the Mineral Labs data pipeline with the spec from Section 7, build real-time exceedance detection on lab import, and connect exceedances to governance routing.

**Why now:** The existing parse-lab-data-edd and import-lab-data Edge Functions handle file parsing. What's missing is: exceedance auto-detection, governance issue creation, and the formal data contract with Mineral Labs.

**Scope:**
- Enhance `import-lab-data` EF to auto-run exceedance detection after successful import
- Build exceedance detection logic: compare each lab result against applicable `permit_limits`
- Handle conditional exemptions (check `conditional_exemptions` table)
- Auto-create `exceedances` records with severity classification
- Auto-create `governance_issues` for HIGH+ severity exceedances
- Fire notification chain per Section 6 notification architecture
- Build lab result late detection: if `custody_transfers` shows lab delivery but no EDD received within 48 hours, alert
- Build sample receipt confirmation workflow (manual or Mineral Labs electronic)
- Build corrected-file import workflow with original-value preservation
- Build hold-time compliance check: `sampling_events.sample_date` to `lab_results.analysis_date`
- Produce Mineral Labs data contract document (from Section 7) for management to share

**Dependencies:** Phase 0 (tables), Phase 3 (governance routing for exceedances).

**Acceptance criteria:**
- Lab EDD import auto-detects exceedances against verified permit limits
- Exceedance creates governance issue routed to Bill Johnson
- SMS/email fires within 1 hour of exceedance detection
- Corrected file import preserves original records and creates correction audit trail
- Hold-time violations flagged automatically
- Lab result late detection fires at 48-hour mark

**Output:** Enhanced import-lab-data EF, exceedance detection logic, Mineral Labs data contract document.

---

### Phase 6: Executive Dashboard & Management Confirmation Layer (Week 7–9)

**Goal:** Wire real data into the existing dashboard shells and build the management confirmation layer the manual requires.

**Why now:** Dashboard shells exist (Layer 4). Governance engine exists (Phase 3). Data is flowing (Phases 4-5). Management needs visibility.

**Scope:**
- Wire SummaryStats: total permits, active outfalls, current-month exceedances, open governance issues, overdue sampling events
- Wire FinancialRiskCard: stipulated penalty exposure from open exceedances
- Wire OperationalStatusCard: field completion rate (today/this week/this month), lab results pending, DMRs due
- Wire ActionQueueCard: governance issues awaiting decision, DMRs awaiting approval, training renewals due
- Build Management Confirmation Layer (per manual §10):
  - Decree paragraph triggered
  - Current issue owner
  - Recommended action path
  - Final decision-maker
  - Evidence attached
  - Deadline met / missed status
  - Open / pending / escalated / closed disposition
- Build WV Supervisor dashboard: field team daily status, data completeness by route, deficiency list, next actions
- Build Bill Johnson compliance dashboard: governance queue, exceedance trends, force majeure log, CD obligation status

**Dependencies:** Phases 3-5 (data flowing through governance and compliance engines).

**Acceptance criteria:**
- Every dashboard card shows live Supabase data (zero placeholder values)
- Management confirmation layer shows every decision with full evidence chain
- Bill Johnson can see all open WV compliance issues in one view
- Tom Lusk can see escalated issues and program-level metrics
- WV Supervisor can see field team status and data completeness

**Output:** Wired dashboard components, ManagementConfirmation.tsx, role-specific dashboard views.

---

### Phase 7: Training, Equipment & QA/QC Modules (Week 8–10)

**Goal:** Build the operations support modules the manual requires as compliance artifacts.

**Why now:** These are required before field go-live. Training records must exist before independent field work. Equipment must be tracked before deployment.

**Scope:**
- Build Training Module:
  - Training record entry (per 10 minimum training tracks from manual §4)
  - Competency verification workflow (written, observation, ride-along, task sign-off)
  - Supervisor sign-off on field readiness
  - Expiry tracking with renewal reminders
  - Bulk training event recording
- Build Equipment Module:
  - Inventory tracking (tablets, meters, coolers, satellite comms, vehicles)
  - Assignment to personnel and zones
  - Calibration log with pass/fail and buffer lot tracking
  - Calibration expiry alerting
  - Maintenance/retirement tracking
- Build Bottle Kit Module:
  - Kit inventory with container composition and preservative types
  - Kit-to-route and kit-to-outfall assignment
  - Status tracking: available → assigned → in field → at lab → consumed
  - Expiry tracking
- Build QA/QC Module:
  - Supervisor data completeness review
  - Duplicate/check event tracking
  - Lab data completeness and timing review
  - Deficiency tracking and closure
  - Route realism review (per manual §11)

**Dependencies:** Phase 0 (tables), Phase 2 (field app needs equipment and training checks).

**Acceptance criteria:**
- Every field sampler has training records with all 10 tracks documented
- Equipment inventory shows all assigned devices with calibration status
- Bottle kits are trackable from receipt to consumption
- QA/QC deficiencies create actionable items with assigned owners and due dates

**Output:** TrainingModule, EquipmentModule, BottleKitModule, QaQcModule pages and components.

---

### Phase 8: Reporting & Quarterly Submission Engine (Week 9–11)

**Goal:** Build the quarterly report generator (Attachments A–G) and 24-hour notification log.

**Why now:** All data is flowing. Quarterly reports due Apr 30, Jul 31, Oct 31, Jan 31. The first system-generated report must be validated against the last manual report before going live.

**Scope:**
- Build quarterly report generator using existing `generate-report` EF framework:
  - Attachment A: Exceedance summary with narratives
  - Attachment B: Corrective action status
  - Attachment C: Sampling completeness summary
  - Attachment D: Stipulated penalty calculations
  - Attachment E: CD obligation compliance status
  - Attachment F: Training and staffing summary
  - Attachment G: Supporting documentation index
- Build 24-hour notification log: call records with timestamp, agency, contact person, summary, reference number
- Build proof-of-submission workflow: upload portal receipt PDF, screenshot, or confirmation email; attach to DMR/quarterly submission record
- Build document export: compliance bundle generator (for mock audits per task 5.12)

**Dependencies:** Phases 4-6 (DMR calculations, exceedance data, governance decisions). Blocked on historical quarterly report from Tom (task 1.23) for format matching.

**Acceptance criteria:**
- Quarterly report generates all 7 attachments from live data
- Report matches format of actual SCC quarterly reports (requires Tom to provide sample)
- 24-hour notification log captures all required fields
- Proof-of-submission attached to every DMR and quarterly submission
- Compliance bundle generates complete audit trail in <30 minutes (task 5.12 mock audit target)

**Output:** Quarterly report templates, NotificationLogPage.tsx, proof-of-submission workflow, compliance bundle generator.

---

### Phase 9: Production Hardening & Go-Live Preparation (Week 10–12)

**Goal:** Security audit, performance testing, E2E testing, parallel run preparation.

**Why now:** All features built. Must prove reliability before field go-live.

**Scope:**
- Security audit: RLS policy review on all 120+ tables, Edge Function auth verification, API rate limiting
- Performance testing: simulate 5 concurrent field users syncing, 50 lab imports, 100 DMR calculations
- E2E testing: full field-to-DMR workflow with test data
- Error monitoring: integrate error tracking (Sentry or equivalent)
- Backup verification: test Supabase Point-in-Time Recovery, verify R2 archival
- MFA enforcement for all users
- Access control testing: verify role-based permissions across all modules
- CI/CD pipeline: automated build, test, deploy to staging
- Parallel run plan: side-by-side manual + system operation for ≥2 months

**Dependencies:** All previous phases complete.

**Acceptance criteria:**
- Zero RLS bypass paths across all tables
- All Edge Functions validate JWT (except public webhooks)
- System handles concurrent usage without errors
- Backup restores verified
- MFA enforced
- E2E test: sample collected in field app → synced → lab data imported → exceedance detected → governance issue created → DMR calculated → quarterly report generated — all automated, all audit-logged

**Output:** Security report, performance test results, E2E test suite, parallel run plan.

---

## 9. MVP vs Safe Go-Live vs Moonshot

### Foundation Build (Phases 0–3, Weeks 1–6)

The minimum to have a functioning field operations system:
- Database schema for all field operations
- Sampling calendar generation
- Mobile field capture app (offline-capable)
- Governance decision routing
- Basic notifications

**Not yet safe for compliance reliance.** No DMR calculations, no exceedance detection, no quarterly reports.

### Minimum Safe Operational Go-Live (Phases 0–6, Weeks 1–9)

Everything needed to run the in-house sampling program with platform support:
- All foundation features
- DMR calculation engine (validated against historical data)
- Lab integration with exceedance detection
- Executive dashboard with live data
- Management confirmation layer
- Governance routing fully operational

**Safe to begin parallel run** (system alongside manual process). Not safe to be system-primary until parallel run proves accuracy over ≥2 months.

### Full Moonshot End-State (Phases 0–9 + Future)

Everything above plus:
- Training/equipment/bottle tracking as compliance artifacts
- Quarterly report auto-generation
- Mock audit compliance bundle in <30 minutes
- Production hardening (security, performance, monitoring)
- Multi-state expansion (KY, TN, VA, AL) using parameterized state configs
- Auto-submission to state DMR portals via API
- Predictive analytics: exceedance trend detection before violations occur
- Weather API integration for automatic rain-event and force majeure classification
- LIMS direct integration (Mineral Labs API rather than file-based EDD)
- Mobile-to-mobile crew communication within the app
- Inventory management for consumables (bottles, preservatives, calibration buffers)

---

## 10. Immediate Next Actions

Strict priority order. Each action is specific, assignable, and unambiguous.

| # | Action | Owner | Blocked By | Output |
|---|--------|-------|-----------|--------|
| 1 | **Write and apply Phase 0 database migration** — all 18 new tables, governance seed data, RLS policies | Engineer | Nothing | Migration SQL applied to Supabase |
| 2 | **Build `generate-sampling-calendar` Edge Function** — frequency rules, semi-monthly spacing, zone assignment | Engineer | Phase 0 | Deployed EF, populated `sampling_calendar` (test data) |
| 3 | **Stand up PWA shell with Service Worker and IndexedDB** — offline architecture foundation | Engineer | Nothing | PWA builds and runs offline |
| 4 | **Build outfall visit recording form** — outlet inspection + sample capture + no-discharge (offline-capable) | Engineer | Action 3 | Field capture forms working offline |
| 5 | **Build governance issue creation and routing** — auto-create from field events, route to Bill Johnson | Engineer | Phase 0 | Governance issues route correctly |
| 6 | **Send Mineral Labs data contract to Bill Johnson / Tom for review** — Section 7 of this document | Speedy | Nothing | Data contract document shared |
| 7 | **Request from Tom: Sampling Matrix, historical DMRs, quarterly report sample, named personnel** | Speedy | Nothing | Email/meeting with specific ask list |
| 8 | **Build DMR calculation Edge Function** — monthly avg, daily max/min, below-detection, NODI | Engineer | Phase 0 | Deployed EF, test calculations |
| 9 | **Build exceedance auto-detection on lab import** — compare results vs limits, create governance issues | Engineer | Actions 5, 8 | Exceedances detected and routed |
| 10 | **Wire Executive Dashboard cards to live Supabase queries** | Engineer | Phases 3-5 data flowing | Dashboard shows real data |
| 11 | **Build chain-of-custody digital workflow** — container tracking, transfer logging, custody gap detection | Engineer | Action 4 | Complete CoC in field app |
| 12 | **Build force majeure deadline calculator and tracking** — 3BD notice, 7CD written, countdown timers | Engineer | Action 5 | Force majeure tracked with deadlines |
| 13 | **Build safety check-in system** — start/midpoint/end of day, missed check-in alerting | Engineer | Action 3 | Safety system operational |
| 14 | **Build training records module** — 10 training tracks, competency verification, supervisor sign-off | Engineer | Phase 0 | Training tracking ready for staff onboarding |
| 15 | **Build equipment/calibration tracking module** — inventory, assignment, calibration logs, expiry alerts | Engineer | Phase 0 | Equipment management ready |
| 16 | **Build DMR review/approve/submit workflow UI** | Engineer | Action 8 | DMR workflow operational |
| 17 | **Build quarterly report generator (Attachments A–G)** | Engineer | Actions 8, 9, 10 | Quarterly reports auto-generated |
| 18 | **Run acceptance test: system DMR calcs vs historical submissions** (task 3.11) | Engineer + Tom | Historical DMRs from Tom | Validation report |
| 19 | **Security audit and RLS review across all 120+ tables** | Engineer | All phases complete | Security report |
| 20 | **Prepare and execute parallel run plan** (system + manual for ≥2 months) | Speedy + Bill Johnson + Tom | Actions 1–17 complete | Parallel run results |

---

*This software is provided as a compliance monitoring tool only. It does not constitute environmental consulting, legal advice, or regulatory interpretation. All permit limits, compliance determinations, and regulatory submissions must be reviewed and approved by the client's licensed environmental professionals and legal counsel before submission to any regulatory agency.*
