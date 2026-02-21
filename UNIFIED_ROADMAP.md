# SCC Compliance Monitoring System — Unified Roadmap

**Last Updated:** February 20, 2026
**Total Tasks:** 201 | **Completed:** 4 | **Remaining:** 197
**Source of Truth:** `roadmap_tasks` table in Supabase (`zymenlnwyzpnohljwifx`)

---

## Progress Summary

| Phase | Name | Sections | Tasks | Done | Status |
|-------|------|----------|-------|------|--------|
| **1** | Organization & Document Collection | 1A-1E | 45 | 0 | Blocked on SCC management |
| **2** | Permit, Lab & Database Inventory | 2A-2H | 64 | 0 | Blocked on Phase 1 (except 2H) |
| **3** | Software Build-Out | 3A-3E | 52 | 4 | **Active — critical path** |
| **4** | EMS Completion & Submission | 4A-4E | 30 | 0 | Depends on Phases 1-3 |
| **5** | Go-Live, Verification & Automation | 5A-5C | 16 | 0 | Final phase |

---

## Completed Milestones

- **3.49** ECHO sync pipeline built (sync-echo-data + detect-discrepancies Edge Functions)
- **3.50** Full ECHO sync: 153/154 permits, 289,488 DMRs, 144,339 discrepancies
- **3.51** Layer 2 code audit: 16 fixes across P0/P1/P2, all deployed
- **3.52** ECHO sync coverage CSV export

---

## Dependency Graph

```
Phase 1 (org/docs) ──→ Phase 2 (inventory) ──→ Phase 3 (software) ──→ Phase 5 (go-live)
       │                      │                       │
       │                      ├── 2H (DB prep) ◄──────┤ Can start NOW
       │                      │                       │
       └──────────────────────┴───→ Phase 4 (EMS) ────┘
                                         │
                              Phase 3D (ECHO/MSHA) ──→ Phase 5C (automation)
                              ├── 3.39 MSHA (blocked on Brian)
                              └── 3.38 VA override (no deps)
```

**Critical path:** 2H → 3.32 (Justice EDD) → 3.33 (DMR pipeline) → 3.35 (re-run detection) → 5.14 (cron sync)

**Can start NOW (no dependencies):**
- 2.62 parameter_aliases migration
- 2.63 outfall_aliases migration
- 3.01 Upload Dashboard UI
- 3.37 ECHO sync coverage panel
- 3.38 VA NPDES ID override flow
- 3.44 reviewed_by tracking
- 3.45 Split loading states
- 3.47 Realtime subscription

---

## Phase 1: Organization & Document Collection

*Owner: SCC Management. 45 tasks. Blocked on client engagement.*

### 1A — People & Roles (20 tasks)

| Task | Description | Depends On | Owner |
|------|-------------|-----------|-------|
| 1.01 | Confirm full legal name of parent company (as on Consent Decree) | — | scc_mgmt |
| 1.02 | Complete list of all 26 subsidiaries with legal names | — | scc_mgmt |
| 1.03 | For each subsidiary: active, in reclamation, or closed? | 1.02 | scc_mgmt |
| 1.04 | Mailing address for parent company (EMS and regulatory filings) | — | scc_mgmt |
| 1.05 | Chief Executive / COO (signs quarterly reports to court) | — | scc_mgmt |
| 1.06 | Corporate Environmental Director (EPA liaison, oversees EMS) | — | scc_mgmt |
| 1.07 | Corporate Legal Counsel (interprets Consent Decree) | — | legal |
| 1.08 | Compliance System Administrator (daily software admin) | — | scc_mgmt |
| 1.09 | Site Manager per active facility | 1.03 | scc_mgmt |
| 1.10 | Environmental Manager per active facility | 1.03 | scc_mgmt |
| 1.11 | Field Sampler(s) per active facility | 1.03 | scc_mgmt |
| 1.12 | Backup/designee for each critical role per facility | 1.09-1.11 | scc_mgmt |
| 1.13 | Verify PE licenses current for DMR signers | 1.10 | scc_mgmt |
| 1.14 | Verify MSHA certifications current for Safety Managers | — | scc_mgmt |
| 1.15 | Define 24-hour phone call person per state agency | 1.10 | scc_mgmt |
| 1.16 | Define 5-day written notification writer per state | 1.10 | scc_mgmt |
| 1.17 | Authorized DMR signer per state | 1.10, 1.13 | scc_mgmt |
| 1.18 | Quarterly CD report signer/submitter | 1.05, 1.06 | scc_mgmt |
| 1.19 | Escalation chain: 2 AM critical exceedance call order | 1.09, 1.10 | scc_mgmt |
| 1.20 | Complete organizational chart with all environmental roles | 1.05-1.12 | scc_mgmt |

### 1B — Document Collection (14 tasks)

| Task | Description | Depends On | Owner |
|------|-------------|-----------|-------|
| 1.21 | Full Consent Decree (Case 7:16-cv-00462-GEC) — hard + digital | — | scc_mgmt |
| 1.22 | Sampling Matrix (outfall → parameter → frequency → limit) | — | scc_mgmt |
| 1.23 | Most recent quarterly EPA report (Q4 2025) with Attachments A-G | — | scc_mgmt |
| 1.24 | Sample raw lab data files (EDD format) — 1 per state minimum | — | scc_mgmt |
| 1.25 | ALL active NPDES permits for ALL facilities across all 5 states | 1.03 | scc_mgmt |
| 1.26 | All permit modifications/amendments since original permits | 1.25 | scc_mgmt |
| 1.27 | All monitoring releases (outfall removal documents) | 1.25 | scc_mgmt |
| 1.28 | WET test suspension letters | 1.25 | scc_mgmt |
| 1.29 | Sample completed DMR submission (as submitted to state portal) | — | scc_mgmt |
| 1.30 | NOVs from any state — last 2 years | — | scc_mgmt |
| 1.31 | Audit reports (internal or third-party) — last 2 years | — | scc_mgmt |
| 1.32 | Existing EMS documentation (if started) | — | scc_mgmt |
| 1.33 | Stipulated penalty payment records (amounts paid to date) | — | scc_mgmt |
| 1.34 | State portal login credentials or portal URLs per state | — | scc_mgmt |

### 1C — DMR Authority (4 tasks)

| Task | Description | Depends On | Owner |
|------|-------------|-----------|-------|
| 1.35 | Confirm "duly authorized representative" letter on file per state | 1.17 | both |
| 1.36 | Portal credential holders + backup + recovery process per state | 1.34 | both |
| 1.37 | DMR signer replacement timeline and reauthorization process | 1.17, 1.35 | both |
| 1.38 | DMR close checklist (missing labs? below-detection rules? QA done?) | 1.17 | both |

### 1D — Emergency Notification (3 tasks)

| Task | Description | Depends On | Owner |
|------|-------------|-----------|-------|
| 1.39 | Exact 24-hour notification phone numbers per state | 2.30-2.49 | both |
| 1.40 | Call log requirement: who logs, where, what fields | 1.15 | both |
| 1.41 | After-hours on-call rotation: named primary + backup per facility | 1.15, 1.19 | both |

### 1E — Governance (4 tasks)

| Task | Description | Depends On | Owner |
|------|-------------|-----------|-------|
| 1.42 | Records retention policy by record type | — | both |
| 1.43 | Data correction policy (approval flow, evidence, justification) | — | both |
| 1.44 | Offboarding and access revocation checklist (same-day) | 1.09-1.12 | both |
| 1.45 | Two-person rule for high-risk actions | 1.17, 1.18 | both |

---

## Phase 2: Permit, Lab & Database Inventory

*64 tasks. Mix of SCC management (2A-2G) and AI-buildable (2H).*

### 2A — Permit Inventory (12 tasks: 2.01-2.12)

Full permit inventory: every NPDES number, facility, state, effective/expiration date, status, outfalls, parameters, limits, sampling frequencies, conditional exemptions.

### 2B — Permit Lifecycle (3 tasks: 2.13-2.15)

Renewal deadlines, change intake process, limit supersession tracking.

### 2C — Lab Relationships (14 tasks: 2.16-2.29)

Certified labs, contacts, state certs, EDD format, turnaround times, reporting limits, WET testing, fish tissue, biological monitoring, bottle types, method codes.

### 2D — Agency Contacts (22 tasks: 2.30-2.51)

Per-state contacts: permit writer, enforcement, DMR support, after-hours emergency for ADEM (AL), KYDEP (KY), TDEC (TN), DEQ (VA), DEP (WV), plus EPA regional and DOJ attorney.

### 2E — Field Equipment (4 tasks: 2.52-2.55)

Instrument inventory, calibration records, COC forms, no-discharge documentation.

### 2F — Storm Event (3 tasks: 2.56-2.58)

Weather stations, storm event evidence packets, exemption authorization.

### 2G — Submission Standards (3 tasks: 2.59-2.61)

Proof-of-submission evidence, state-specific DMR rules, unit normalization.

### 2H — Database Prep Migrations (3 tasks) **[NEW — no dependencies, can start NOW]**

| Task | Description | Depends On | Owner | Status |
|------|-------------|-----------|-------|--------|
| **2.62** | Build `parameter_aliases` table — maps parameter name variations to STORET codes | — | AI | not_started |
| **2.63** | Build `outfall_aliases` table — maps outfall naming conventions across states | — | AI | not_started |
| **2.64** | Validate STORET code seed data against real lab/DMR data | 2.62 | AI | not_started |

---

## Phase 3: Software Build-Out

*52 tasks. 4 complete. This is where the code lives.*

### 3A — Core Application (22 tasks: 3.01-3.22)

| Key Tasks | Description | Status |
|-----------|-------------|--------|
| **3.01** | Upload Dashboard UI (handoff spec v5+v6) | not_started |
| 3.06 | Lab data EDD parser | not_started |
| 3.07 | NetDMR CSV parser | not_started |
| 3.08 | OSMRE Monitoring Report parser | not_started |
| 3.12 | Compliance dashboard (real-time status) | not_started |
| 3.13 | Exceedance alerting (Resend email, Twilio SMS) | not_started |
| 3.14 | Sampling calendar generator | not_started |
| 3.15 | DMR calculation engine | not_started |
| 3.16 | DMR review/approve/submit workflow | not_started |
| 3.17 | Stipulated penalty calculator | not_started |
| 3.18 | Quarterly report generator (Attachments A-G) | not_started |
| 3.19 | Corrective action tracking module | not_started |
| 3.20 | Roadmap module (partially built — RoadmapPage exists) | not_started |
| 3.21 | Consent Decree obligation tracker | not_started |
| 3.22 | 24-hour notification call log | not_started |

### 3B — Infrastructure (5 tasks: 3.23-3.27)

Dev/stage/prod separation, backup/restore testing, monitoring/alerting for failed parsers, audit trail verification, disclaimer integration.

### 3C — Audit & Compliance Controls (4 tasks: 3.28-3.31)

Evidence capture for portal submissions, change log UI, access control hardening, data correction workflow.

### 3D — External Data Pipeline (15 tasks) **[NEW — ECHO/MSHA integration]**

| Task | Description | Depends On | Owner | Status |
|------|-------------|-----------|-------|--------|
| **3.32** | Justice EDD parser Edge Function | 1.24, 2.62, 2.63 | AI | not_started |
| **3.33** | DMR submission pipeline (dmr_submissions + dmr_line_items) | 3.32, 1.29 | AI | not_started |
| **3.34** | Wire parsers into Upload Dashboard flow | 3.01, 3.32 | AI | not_started |
| **3.35** | Full discrepancy detection re-run (all 3 rules with real data) | 3.32, 3.33 | AI | not_started |
| **3.36** | Triage initial discrepancies through Review Queue | 3.35 | both | not_started |
| **3.37** | ECHO sync coverage panel | — | AI | not_started |
| **3.38** | Manual VA NPDES ID override flow (DMLR → NPDES mapping) | — | AI | not_started |
| **3.39** | Obtain MSHA mine ID mapping | — | Brian | **BLOCKED** |
| 3.40 | Implement sync-msha-data pipeline | 3.39 | AI | not_started |
| 3.41 | MSHA detection rules (Rules 4-6) | 3.40 | AI | not_started |
| 3.42 | MSHA frontend integration | 3.40 | AI | not_started |
| ~~3.49~~ | ~~ECHO sync pipeline built~~ | — | AI | **COMPLETE** |
| ~~3.50~~ | ~~Full ECHO sync (153/154 permits, 289K DMRs)~~ | 3.49 | AI | **COMPLETE** |
| ~~3.51~~ | ~~Layer 2 code audit (16 fixes)~~ | 3.50 | AI | **COMPLETE** |
| ~~3.52~~ | ~~ECHO sync coverage CSV export~~ | 3.50 | AI | **COMPLETE** |

### 3E — Pipeline Hardening & Polish (6 tasks) **[NEW]**

| Task | Description | Depends On | Owner | Status |
|------|-------------|-----------|-------|--------|
| **3.43** | DiscrepancyTable virtualization (@tanstack/react-virtual) | 3.35 | AI | not_started |
| **3.44** | reviewed_by tracking on discrepancy actions | — | AI | not_started |
| **3.45** | Split loading states in useExternalData | — | AI | not_started |
| **3.46** | RBAC on sync/resolve action buttons | 3.01 | AI | not_started |
| **3.47** | Realtime subscription for sync_log changes | — | AI | not_started |
| **3.48** | MSHA dedup index | 3.40 | AI | not_started |

---

## Phase 4: EMS Completion & Submission

*30 tasks. Depends on Phases 1-3.*

### 4A — EMS Document (11 tasks: 4.01-4.11)

Fill in all EMS sections: facility counts, Environmental Policy Statement, named individuals, field sampling SOPs, escalation procedures, penalty rates, training materials, appendices.

### 4B — EMS Operations (4 tasks: 4.12-4.15)

Management review cadence, training tracking, emergency response plans, document control.

### 4C — Consent Decree Obligation Mapping (6 tasks: 4.16-4.21)

For each of 75 CD obligations: evidence artifacts, named owner, done definition, recurrence rules, trigger conditions, submission pathway.

### 4D — EMS Review & Approval (7 tasks: 4.22-4.28)

Legal review → executive approval → EPA submission → feedback cycle → facility distribution → training → annual review.

### 4E — EMS Package (2 tasks: 4.29-4.30)

Submission packet assembly, version history and distribution log.

---

## Phase 5: Go-Live, Verification & Automation

*16 tasks.*

### 5A — Operational Verification (11 tasks: 5.01-5.11)

First real-time compliance check, system-generated DMR comparison, first state portal submission, quarterly report generation, exceedance alert chain test, management review, internal audit, leadership presentation, system-primary transition, first EMS audit, ROI tracking.

### 5B — Audit Readiness (2 tasks: 5.12-5.13)

Mock regulator audit, quarterly access review cadence.

### 5C — Automated Sync & Monitoring (3 tasks) **[NEW]**

| Task | Description | Depends On | Owner | Status |
|------|-------------|-----------|-------|--------|
| **5.14** | Cron-based ECHO sync (weekly, permits older than 7 days) | 3.35 | AI | not_started |
| **5.15** | Sync health dashboard (admin: last sync, failures, stale permits) | 5.14 | AI | not_started |
| **5.16** | Discrepancy/compliance alert rules (Resend/Twilio) | 3.13, 3.35 | AI | not_started |

---

## What To Build Next (Recommended Order)

### Immediate (no dependencies)

1. **2.62** + **2.63** — parameter_aliases + outfall_aliases migrations
2. **3.01** — Upload Dashboard UI (critical path, handoff spec ready)
3. **3.37** — ECHO sync coverage panel
4. **3.38** — VA NPDES ID override flow

### After Upload Dashboard (3.01)

5. **3.32** — Justice EDD parser (needs sample EDD file from SCC — task 1.24)
6. **3.33** — DMR submission pipeline
7. **3.34** — Wire parsers into Upload Dashboard

### After Internal Data Exists

8. **3.35** — Full discrepancy detection re-run
9. **3.36** — Triage initial discrepancies
10. **3.43** — Table virtualization

### Parallel (anytime)

- **3.44** reviewed_by tracking
- **3.45** Split loading states
- **3.47** Realtime sync subscription

### Blocked

- **3.39-3.42** MSHA pipeline — blocked on mine ID mapping from Brian
- **Phase 1** (1.01-1.45) — blocked on SCC management engagement
- **Phase 2** (2.01-2.61) — blocked on Phase 1 documents

---

*Generated by SCC Compliance Monitor. This document mirrors the `roadmap_tasks` database table. For the authoritative task list, query the database directly.*
