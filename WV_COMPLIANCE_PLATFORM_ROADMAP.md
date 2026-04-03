# WV Sampling Compliance Platform — Phased Roadmap

## Context

Southern Coal is under an active Clean Water Act Consent Decree. The current codebase has ~80% of field sampling execution built (6-step wizard, outlet inspections, evidence capture, offline queue, governance intake, sampling calendar/routes) and ~60% of the compliance platform (upload dashboard, ECHO sync, exceedance detection, corrective actions). The full build spec transforms this from a field collection app into a **closed-loop compliance command system** covering 17+ functional modules, 15+ roles, and two separate escalation chains.

**What exists:** 82 migrations, 35+ tables, 26 pages, 47 hooks, 8 roles, 89 audit action types, offline-first field operations, and ECHO/DMR ingestion pipeline.

**What's needed:** Permit versioning, incident engine, escalation orchestrator, recovery tickets, COC enhancement, training/certification, equipment management, communications engine, KPI framework, executive cockpit, compliance database, public export controls, and go-live hardening.

---

## Phase 1: Foundation Hardening & Offline Completion

**Goal:** Make existing field ops production-grade. Close Lane A M1/M2.

**Scope:**
- Complete offline field visit execution: durable IndexedDB route cache, sync health visibility, blocked-queue admin resolution
- Harden outbound queue conflict holds: admin override for stuck ops
- Fix governance hardcoded owner → configurable `governance_escalation_config` table
- Complete RLS verification on all field ops tables
- Integration tests for 6-step wizard (online + offline paths)
- Harden `complete_field_visit` RPC: idempotency guard, atomic sampling_event creation

**New tables:** `governance_escalation_config`, `field_outbound_sync_log`
**Modified:** `field_visits` (add `offline_created_at`)
**Pages:** No new pages. `/admin` gets Sync Queue tab.
**Key files:** `src/lib/fieldOutboundQueue.ts`, `src/hooks/useFieldOps.ts`, `src/hooks/useGovernanceIssues.ts`

**Exit criteria:** WV sampler completes full day route in airplane mode, reconnects, all data syncs. Governance routes to configurable owners.

---

## Phase 2: Role System Expansion & Record Classification

**Goal:** Foundation for all subsequent phases — expanded roles and data classification.

**Scope:**
- Expand from 8 to 15 roles: add `wv_supervisor`, `float_sampler`, `courier`, `compliance_reviewer`, `coo`, `ceo_view`, `chief_counsel`, `maintenance_owner`, `lab_liaison`
- Update `src/types/auth.ts`, all role groups in `src/lib/rbac.ts`
- Add fine-grained permissions table + role_permissions join
- Implement 6-level record classification (Operational Internal → Restricted)
- Add `classification_level` column to `field_visits`, `governance_issues`, `corrective_actions`, `exceedances`
- Auto-classification rules (e.g., decree_paragraphs present → Compliance Sensitive minimum)

**New tables:** `permissions`, `role_permissions`, `record_classifications`, `classification_rules`
**New pages:** `/admin/roles`
**Key files:** `src/lib/rbac.ts`, `src/types/auth.ts`, `src/App.tsx`

**Exit criteria:** All 15 roles sign in and see only permitted pages. Classification auto-applies. Backward-compatible with existing 8 roles.

---

## Phase 3: Notification Engine & Readiness Gate

**Goal:** Cross-cutting notification infrastructure + pre-dispatch qualification checks.

**Scope:**
- **Notifications:** `notifications` table, in-app bell icon, email (Resend), SMS (Twilio), 5 severity levels, 15+ event types, user preferences
- **Readiness gate:** Pre-dispatch checklist (training current, certs valid, equipment assigned/calibrated). Blocking vs soft warnings. Admin override with reason.

**New tables:** `notifications`, `notification_preferences`, `notification_templates`, `readiness_requirements`, `readiness_checks`
**Modified:** `sampling_route_batches` (add `readiness_gate_passed`, `readiness_override_by`)
**New pages:** `/admin/notifications`, notification drawer in AppShell
**Key files:** New edge functions for email/SMS dispatch

**Exit criteria:** Users receive in-app notifications. Dispatch blocked for expired readiness checks. Override with audit trail.

---

## Phase 4: Training, Certification & Equipment Management

**Goal:** Workforce qualification + equipment tracking feeding Phase 3 readiness gate.

**Scope:**
- **Training:** Catalog, requirements matrix by role, completion tracking with certificate upload, expiration monitoring (30/14/7-day warnings), dispatch blocking on expiry
- **Equipment:** Catalog (tablets, meters, GPS, coolers, vehicles), assignments, calibration logs, maintenance logs, daily readiness checklist, bottle kit inventory

**New tables:** `training_catalog`, `training_requirements`, `training_completions`, `equipment_catalog`, `equipment_assignments`, `calibration_logs`, `maintenance_logs`, `daily_readiness_checklists`, `bottle_kit_inventory`
**New pages:** `/admin/training`, `/admin/equipment`, `/field/readiness` (mobile), `/profile/certifications`

**Exit criteria:** Expired certification blocks dispatch. Calibration due date triggers notification. Daily readiness checklist completable on mobile.

---

## Phase 5: Incident Engine & Escalation Orchestrator

**Goal:** Replace narrow governance (2 types) with formal incident engine (18+ types) and two separate escalation chains.

**Scope:**
- **Incident engine:** 18+ incident types with severity, recoverability, countdown clocks, evidence linking, auto-CA creation
- **Escalation orchestrator:**
  - Operational chain: Job Supt → PE (Derek O'Neil) → Bill Johnson → John Lawson → Tom Lusk
  - Compliance chain: Bill → Tom → COO → CEO/Counsel
  - Configurable per incident type, auto-escalation on SLA timeout
- **Migration:** Existing `governance_issues` preserved, new `incidents` table references via `legacy_governance_issue_id`

**New tables:** `incident_types`, `incidents`, `incident_events`, `escalation_chains`, `escalation_chain_overrides`
**New pages:** `/incidents`, `/incidents/:id`
**Modified:** `/governance/issues` renders through incident model

**Exit criteria:** Broken container triggers incident with countdown. Auto-escalation on SLA timeout. Compliance escalation reaches chief_counsel for privileged items.

---

## Phase 6: Chain of Custody, Compromised Samples & Recovery Tickets

**Goal:** End-to-end sample integrity tracking with emergency recovery.

**Scope:**
- **Digital COC:** Full record with barcode linkage, handoff tracking (sampler → courier → lab), locking after lab receipt, version trail
- **Cooler batch tracking:** Which samples in which cooler, temp logger readings
- **Compromised samples:** Detection triggers (broken container, cooler excursion, hold time violation), severity grading, recollection routing
- **Recovery tickets:** Emergency re-booking, countdown clocks, float sampler auto-assignment, priority dispatch queue

**New tables:** `chain_of_custody`, `coc_versions`, `coc_handoffs`, `cooler_batches`, `compromised_samples`, `recovery_tickets`
**New pages:** `/coc`, `/coc/:id`; recovery tickets appear in dispatch queue
**Modified:** `field_measurements` (add `coc_id`)

**Exit criteria:** COC tracks handoffs with GPS/timestamp. Cooler temp excursion auto-creates compromised sample incident. Recovery ticket dispatches float_sampler with countdown.

---

## Phase 7: Permit Versioning & Force Majeure Support

**Goal:** Permit version history + formal FM package assembly with deadline calculators.

**Scope:**
- **Permit versioning:** `permit_versions`, `outfall_versions`, `parameter_rule_versions` with effective dates. Exceedance detection uses version effective at sample date. Side-by-side diff UI.
- **Governance review queue:** Decree paragraph tagging, legal sensitivity flags, evidence completeness meter, two-person decision review
- **Force majeure support:** 3-business-day + 7-day deadline calculators, evidence checklist, notice draft generation, immutable package snapshots

**New tables:** `permit_versions`, `outfall_versions`, `parameter_rule_versions`, `governance_review_decisions`, `evidence_completeness_requirements`, `force_majeure_packages`, `holidays`
**Modified:** `permit_limits` (add `permit_version_id`, `effective_date`, `superseded_date`)
**New pages:** `/admin/permits/:id/versions`, `/governance/review`, `/governance/review/:id`, `/governance/force-majeure/:id`

**Exit criteria:** Exceedance uses permit limits effective at sample date. FM auto-calculates deadlines. Legal sensitivity restricts to chief_counsel+.

---

## Phase 8: Work Orders, Compliance Database & Human Override

**Goal:** Deficiency work orders, violation/NOV database, and authorized override system.

**Scope:**
- **Work orders:** Triggered by inspection deficiencies, SLA tracking, before/after photos, recurring deficiency detection
- **Compliance database:** Violations, root causes, penalties, NOVs, enforcement actions, ECHO enforcement sync
- **Human override:** Override with reason for automated determinations, legal hold (do-not-auto-close), dispute resolution

**New tables:** `work_orders`, `work_order_events`, `compliance_violations`, `nov_records`, `enforcement_actions`, `human_overrides`, `legal_holds`
**New pages:** `/work-orders`, `/work-orders/:id`, `/compliance/violations`, `/compliance/violations/:id`

**Exit criteria:** Inspection obstruction auto-creates work order. Chief_counsel can place legal hold. Override creates immutable audit record.

---

## Phase 9: Communications Engine & Dispatch Board Enhancement

**Goal:** Regulatory notice generation/approval + drag-and-drop dispatch.

**Scope:**
- **Communications:** Notice templates, recipient management, draft → review → approve → send workflow, attachment linking, regulatory submission log
- **Dispatch board:** Drag-and-drop reorder, emergency queue for recovery tickets, at-risk events, float assignment panel, batch dispatch, real-time route progress

**New tables:** `communications`, `communication_attachments`, `recipient_templates`, `communication_versions`, `regulatory_submission_log`
**Modified:** `sampling_route_stops` (add `drag_order`, `eta_minutes`)
**New pages:** `/communications`, `/communications/:id`, `/communications/new`; `/field/dispatch` major upgrade

**Exit criteria:** FM notice auto-populates from incident data. Approval blocks send. Drag-and-drop dispatch persists. Recovery tickets in emergency queue.

---

## Phase 10: Reporting, KPIs & Executive Cockpit

**Goal:** Comprehensive reporting engine, KPI framework, and leadership dashboard.

**Scope:**
- **5 report families:** Operational, Compliance, Executive, Regulator, Public Eligible
- **KPI framework:** Field, Recovery, Compliance, Workforce, Site Reliability KPIs with targets and trend analysis
- **Executive cockpit:** Risk map, penalty prevention board, trend charts, alert summary, drill-down

**New tables:** `report_schedules`, `kpi_definitions`, `kpi_snapshots`, `kpi_targets`, `executive_dashboard_config`
**New pages:** `/executive`, `/executive/kpis`, `/reports/public`

**Exit criteria:** Executive cockpit loads real KPI data. Monthly snapshots auto-generate. Report scheduling delivers PDF via email.

---

## Phase 11: Public Export Controls & Regulatory Integration

**Goal:** Decree-required public data publication + regulatory submission pipeline.

**Scope:**
- **Public exports:** Publication workflow with two-person approval, data redaction, read-only API endpoint, scheduled publication
- **Regulatory integration:** Enhanced ECHO sync, NetDMR submission pipeline, eReporting compliance, submission receipt tracking

**New tables:** `public_publications`, `publication_approvals`, `public_api_keys`, `regulatory_contacts`, `regulatory_submissions`
**Modified:** `dmr_submissions` (add NetDMR fields)
**New pages:** `/compliance/public-data`, `/admin/regulatory-contacts`, `/admin/api-keys`

**Exit criteria:** Public endpoint returns only published/redacted data. Two-person approval enforced. NetDMR generates valid submission packages.

---

## Phase 12: Hardening, Audit & Go-Live Readiness

**Goal:** Production certification across all modules.

**Scope:**
- Audit trail completeness verification across all 11 phases
- Automated RLS audit (every table has policies)
- Performance optimization (N+1 queries, indexes, report generation speed)
- Security hardening (penetration test, JWT review, rate limiting)
- 4+ hour offline resilience test
- UAT scripts for all 15 roles
- Mobile optimization audit for field-shell pages
- Operational runbooks for each module

**New tables:** `system_health_checks`, `rls_audit_results`
**New pages:** `/admin/system-health`

**Exit criteria:** Every table has RLS (automated check). Every material action writes audit_log (automated check). 4-hour offline test passes. All roles complete UAT. Page load <2s, report gen <30s.

---

## Dependency Chain

```
Phase 1 (Harden existing)
  → Phase 2 (Roles + Classification)
    → Phase 3 (Notifications + Readiness)
      → Phase 4 (Training + Equipment)
        → Phase 5 (Incidents + Escalation)
          → Phase 6 (COC + Recovery)
            → Phase 7 (Permit Versioning + FM)
              → Phase 8 (Work Orders + Compliance DB)
                → Phase 9 (Communications + Dispatch)
                  → Phase 10 (Reporting + KPIs + Exec)
                    → Phase 11 (Public + Regulatory)
                      → Phase 12 (Hardening + Go-Live)
```

Each phase: **plan → implement → test → review → next phase.**

---

## Verification Approach

Each phase should be verified by:
1. `npm run typecheck` — no TypeScript errors
2. `npm run lint` — no lint violations
3. `npm run build` — production build succeeds
4. Manual testing of new pages/workflows
5. RLS policy verification via Supabase SQL editor
6. Audit log spot-check for new action types
