# SCC Water Sampling Platform — Codex Handoff Roadmap

**Version:** 2.1 | **Date:** March 31, 2026  
**Purpose:** Build roadmap optimized for Codex / autonomous execution

---

## Navigation (do not skip)

| Read first | Role |
|------------|------|
| **[`UNIFIED_ROADMAP.md`](../UNIFIED_ROADMAP.md)** | **Canonical hub** — how this file, the Definitive roadmap, and `roadmap_tasks` fit together; **phase crosswalk** (Codex phase numbers ≠ Definitive phase numbers). |
| **[`LANE_A_MILESTONE_1.md`](./LANE_A_MILESTONE_1.md)** | **Active Lane A product milestone** — one-sentence north star, acceptance criteria (A1–A6), code map, implementation slices. |
| **[`SCC_Water_Sampling_Platform_Definitive_Build_Roadmap.md`](./SCC_Water_Sampling_Platform_Definitive_Build_Roadmap.md)** | Narrative depth, manual § mapping, acceptance criteria, week-style estimates. |
| **This file** | **Execution rules** and **ordered Phases 0–10** for WV field-to-DMR software. |

**Ordering rule:** For WV in-house field software, follow **§7 Phased roadmap** here in sequence. UNIFIED_ROADMAP Phases 1–5 are the **compliance program / task-ID** track; they do **not** replace this sequence for field-core delivery.

---

1. What this roadmap is for
This roadmap is the engineering source of truth for Codex. Its job is to tell Codex:
what is confirmed
what must be verified before building
what is legally required versus operationally preferred
what to build first
what not to touch
what constitutes done
This is not a blank-sheet architecture exercise. It is a controlled implementation plan for turning the existing compliance platform into the operating system for the West Virginia in-house sampling program. The WV Operations Manual is the operational design reference. The Consent Decree is the legal ceiling and floor. The governance addendum is the controlling escalation rule for WV sampling compliance.
2. Codex operating instructions
Codex must follow these rules throughout the build:
Do not assume the current-state inventory is correct just because it appears in a roadmap.
The project brief says the system had 44 RLS-enabled tables and 2 Edge Functions at one point, while the later roadmap states 102 tables and 27 Edge Functions. That means current-state claims must be verified against the live repo and database before Codex treats them as truth.
Do not rebuild existing functional layers.
Reuse what exists unless verification proves it is dead, placeholder-only, or unusable.
Do not change existing production schema, functions, or buckets casually.
Extend with migrations and new modules. Avoid destructive refactors.
Treat every requirement as one of three buckets:
Decree-required
Operations-required
Platform-enhancement
Phase-gate the build.
Do not begin moonshot modules before the field-core workflow is working.
For anything legally sensitive, preserve evidence, timestamps, authorship, and auditability.
When uncertain, prefer explicit verification over clever inference.
3. North-star outcome
Build a WV-first field-to-DMR system that:
schedules required sampling correctly
works offline in remote field conditions
records field events with defensible evidence
preserves chain of custody
routes compliance issues through the locked governance chain
ingests lab results fast enough to support decree deadlines
supports DMR preparation and quarterly reporting
can later be parameterized for KY, TN, VA, and AL
This direction is consistent with the operations manual’s field workflow, training and equipment expectations, the decree’s sampling, outlet inspection, database, reporting, training, and force majeure structure, and the governance addendum.
4. Reality check: what is confirmed vs unverified
4.1 Confirmed from uploaded materials
The following are supported by the files you provided:
The original platform brief described a Supabase project with 44 RLS-enabled tables, 8 storage buckets, and 2 deployed Edge Functions, with the Upload Dashboard as the then-critical milestone.
A later roadmap claims a more advanced state with 102 tables, 27 deployed Edge Functions, and substantial imported data.
The WV in-house sampling program is operationally centered on 313 active monitoring points, 10 permits, 584 monthly sampling events, four technicians, one supervisor, Beckley plus Man staging, and offline field realities.
Governance for WV sampling-compliance matters is locked: Bill Johnson first, then Tom Lusk, then President/CEO and/or Chief Counsel.
Force majeure requires a 3-business-day notice and 7-calendar-day written explanation, and missed timing can forfeit the defense.
The Consent Decree requires, among other things, outlet inspections, sampling verification data, a compliance database, prompt electronic handling of lab results, annual/semiannual training structures, quarterly reporting, and preservation of records.
The ECHO sync work proves there is at least one later-stage external-data pipeline that loaded large federal datasets and discrepancy review data.
4.2 Unverified and must not be treated as settled until Phase 0.5
actual live table count
actual deployed Edge Function count
which UI layers are real vs shell-only
whether 7,456 permit limits are loaded and usable
whether those permit limits are verified by management
whether the sampling calendar logic exists in any useful form
whether any field-event data model already exists and can be extended
whether the DMR engine exists in any meaningful way
what parts of the roadmap reflect repo truth vs planning intent
5. Requirement buckets
Every work item must be tagged with one of these categories.
5.1 Decree-required
These are directly anchored in the Consent Decree or force majeure obligations.
Examples:
DMR sample timing support
outlet inspection support
temporal/spatial verification evidence
compliance database record capture
lab-result intake support for timely awareness
violation tracking
reporting support
training record support
force majeure deadline tracking
auditable records retention posture
Supporting sources:
5.2 Operations-required
These are necessary to run the WV in-house sampling program described in the manual.
Examples:
route execution
bottle-kit handling
field device workflows
calibration tracking
staging logistics
runner/coordinator workflows
safety check-ins
ride-along tracking
supervisor approvals
Supporting source:
5.3 Platform-enhancement
These improve usability or long-term scaling but are not required for WV go-live.
Examples:
advanced route optimization
multi-state abstraction layer beyond what WV launch needs
executive analytics polish
automated portal submission
deep forecasting dashboards
nonessential AI assistants
6. What Codex must build first
The first real milestone is not “everything in the roadmap.”
It is the field-core compliance chain:
sampling calendar
route execution
field-event capture
no-discharge documentation
chain of custody
governance issue creation
offline sync
lab-result linkage
exceedance/force majeure trigger handling
DMR-prep-ready data completeness
That is the launch spine.
7. Phased roadmap
Phase 0 — Orientation
Goal
Understand current codebase and constraints without changing production behavior.
Tasks
Read controlling docs and extract non-negotiables
Inventory existing frontend modules, tables, Edge Functions, and migrations
Map existing app areas to roadmap sections
Create a “verified vs claimed” matrix
Deliverables
repo inventory memo
module map
verification worksheet
Done when
Codex can say what exists, what is partial, and what is absent without guessing.
Phase 0.5 — Verification sprint
Goal
Resolve the fact-base conflict before major build work begins.
Why this exists
Your assessment correctly identified that the roadmap’s current-state section was too confident relative to mixed project evidence. This phase fixes that.
Tasks
verify live table count
verify live Edge Function count
verify storage buckets and policies
verify seeded roles and obligation structures
verify whether field-related tables already exist
verify whether existing calendar/schedule tables are empty, partial, or abandoned
verify whether permit limits are loaded and whether they are marked verified or unverified
verify whether existing report-generation functions are usable
verify whether current audit logging is sufficient for field evidence changes
verify which dashboard pages are real and which are shells
Required artifact
A Verification Report with four labels on every claim:
Confirmed from repo
Confirmed from database
Confirmed from uploaded document
Inferred / needs verification
Stop condition
No Phase 1 coding until this report exists.
Phase 1 — WV launch core data model
Goal
Create the minimum data backbone for field operations without breaking existing compliance infrastructure.
Scope
Only build what is needed for WV launch spine.
Likely entities
These names are illustrative; Codex should fit them to existing schema if possible rather than force a naming ideology:
field_visit / field_event
outlet_inspection
no_discharge_event
access_issue
force_majeure_candidate
field_measurement
route_assignment
route_stop_status
chain_of_custody
custody_transfer
cooler_log
bottle_kit / bottle_assignment
equipment_assignment
calibration_log
training_record
competency_check
governance_issue
governance_decision
sync_queue / conflict_log
evidence_asset link tables
Rules
prefer additive migrations
preserve org/site/state scoping
preserve RLS discipline
every legal/compliance object needs audit visibility
every evidence-bearing object needs timestamp + actor + source
Done when
The schema can represent a full WV sampling day from route start to lab handoff and issue escalation.
Phase 2 — Sampling calendar and route generation
Goal
Turn permit-driven obligations into executable field work.
Minimum capabilities
generate required visits by frequency
support semi-monthly spacing logic as configured
support weekly and rain-event items
group work into routeable assignments
mark overdue / due soon / completed / exception
permit manual supervisor overrides with reason logging
Important caution
The operations manual references spacing and routing assumptions, but some permit-level details may vary. Build configurable rule support, not hard-coded dogma.
Inputs
verified permit/outfall/frequency data
WV sampling matrix once received
supervisor override capability
Done when
A supervisor can produce a workable WV schedule and routes for the month and daily field lists.
Phase 3 — Field execution app
Goal
Enable technicians to perform and document field work in remote conditions.
Priority decision
Use the fastest architecture that preserves offline reliability and leverages existing stack. The earlier roadmap leaned toward PWA/Capacitor-style pragmatism; that remains the right bias unless verification proves native requirements are unavoidable.
Required capabilities
login and scoped access
download assigned route
offline route list and stop details
GPS/timestamp capture
outlet inspection checklist
sample collected / no discharge / access issue / other exception flows
photo capture with attachment requirement where mandated
field measurements entry
bottle/container verification
chain-of-custody initiation
sync state visibility
incomplete-visit flags
Specific compliance behaviors
no-discharge cannot be marked complete without required evidence
access issue requires documentation and escalation path
force majeure candidate creation must surface immediately for review
every route stop must end in a clear disposition
Done when
A sampler can complete a full day in airplane mode and sync later without losing legal evidence.
Phase 4 — Offline sync and conflict resolution
Goal
Make field capture trustworthy outside cell coverage.
Requirements
local durable storage
outbound queue
deterministic conflict rules
attachment retry handling
duplicate prevention
sync audit trail
user-visible sync health
Conflict policy
Prefer narrow, explicit rules:
immutable event creation IDs
append-only evidence records where possible
if two edits conflict on legally meaningful fields, create review state rather than silent overwrite
Done when
You can simulate multi-hour offline use, reconnect, and preserve one accurate record set.
Phase 5 — Governance and issue-routing engine
Goal
Implement the locked WV escalation model in software.
Governing rule
All WV sampling-compliance issues route to Bill Johnson first, then escalate to Tom Lusk, then by COO decision to President/CEO and/or Chief Counsel.
Issue types
exceedance review
force majeure candidate
compromised sample
access issue
no-discharge sufficiency review
deadline-sensitive reporting decision
decree interpretation gray area
Required fields
issue type
related permit/outfall/event
decree paragraph(s) implicated
raised timestamp
current owner
SLA / deadline
evidence attached
decision history
final disposition
Done when
Every material WV compliance issue has a tracked owner, escalation history, and final decision record.
Phase 6 — Mineral Labs data contract and lab ingestion hardening
Goal
Turn lab intake from “parser exists” into a dependable operating contract.
Why
The current materials say lab ingestion tooling exists or partially exists, but there is still no formalized data contract in the roadmap. That gap needs to be closed before Codex builds downstream logic around assumptions.
Tasks
define required EDD structure
define delivery timing expectations
define sample receipt confirmation handling
define corrected-file behavior
define alias management
define failed-row triage
define outfall matching rules
define exceeded-limit detection inputs
Done when
A written integration spec exists and test files pass reliably.
Phase 7 — Exceedance, force majeure, and exception handling
Goal
Connect field reality and lab results to deadline-sensitive compliance workflows.
Required behaviors
when verified lab data exceeds verified limits, create reviewable exceedance event
when a field event is tagged as force majeure candidate, calculate deadlines immediately
display 3-business-day and 7-calendar-day clocks clearly
produce notice-ready data packet support
escalate borderline cases fast
Legal caution
The system should support force majeure process and evidence collection, but not pretend the app “declares” force majeure. That remains a legal/compliance decision under the governance chain. The timing stakes are explicit in the decree and quick-reference guide.
Done when
Potential missed-sample excuses and lab exceedances become timely, trackable, decision-routed issues.
Phase 8 — DMR calculation and review workflow
Goal
Produce draft DMR-ready values and workflow support.
Requirements
parameter-by-parameter aggregation
monthly averages, daily max/min where relevant
sample count sufficiency checks
no-discharge / NODI support
below-detection handling with configurable state rules
reviewer signoff flow
evidence attachment for proof of submission
Caution
Do not auto-submit to external portals in WV launch scope unless explicitly approved. Human-assisted submission is safer for first go-live.
Validation
Use historical ECHO data and actual internal submission records once those datasets are connected. The ECHO pipeline is already a strong validation asset.
Done when
A compliance reviewer can see a defensible draft DMR package and approve/reject line items.
Phase 9 — Training, equipment, and QA/QC modules
Goal
Support operational defensibility and decree-related training expectations.
Build
training records
annual refresher tracking
competency verification
ride-along logs
equipment inventory
calibration tracking
kit readiness
cooler and seal controls
QA/QC check workflows
Why
These are heavily emphasized in the WV manual and harmonize with EMS/document-control expectations.
Done when
Supervisor and compliance management can prove technician readiness and field-equipment integrity.
Phase 10 — Quarterly reporting and production hardening
Goal
Support recurring legal/compliance reporting and make the system stable enough for real operations.
Scope
quarterly report data assembly
attachment support
report status tracking
immutable/archival export strategy for critical records
performance tuning
backup/recovery checks
audit review
storage scaling for photos/evidence
Special note
The assessment correctly raised concern about audit log immutability under admin access. Production hardening should include append-only or external archival strategy for the most defensible evidence streams.
Done when
The WV program can run on the platform without paper fallback being the real system of record.
8. Build order inside each phase
For Codex, each phase should execute in this sequence:
inspect existing code and schema
propose smallest additive change
implement
test locally
validate against source docs
mark assumptions explicitly
stop at phase boundary and summarize
Do not let Codex bundle multiple unrelated modules in one leap.
9. Definition of done for WV go-live
WV go-live is achieved when all of the following are true:
schedule generation works from verified WV permit/outfall data
field samplers can execute routes offline
each visit produces a defensible event record
no-discharge events require evidence
chain of custody is recorded digitally
governance issues route correctly to Bill Johnson first
force majeure candidate timing is tracked correctly
lab data can be linked to field events reliably
reviewers can produce draft DMR-supporting records
training/equipment/calibration records are tracked
critical evidence is auditable and exportable
If any of those are missing, WV go-live is not complete.
10. What Codex must not do
do not assume the 102-table / 27-function claim is true without proving it
do not refactor the whole app for elegance
do not hard-code WV assumptions into all future states where a config model is possible
do not build executive polish before field-core works
do not auto-submit regulatory reports in first launch scope
do not convert legally sensitive judgment calls into silent automation
do not treat AI-extracted permit limits as final unless management verification exists
11. Immediate next actions for Codex
Codex should start with these exact outputs:
A. Verification Report
One document listing:
actual schema inventory
actual Edge Functions
actual partial modules
verified blockers
reusable assets
dead shells
B. WV Launch Gap Matrix
Columns:
capability
decree-required / ops-required / enhancement
exists
partial
missing
blocker
proposed phase
C. Phase 1 technical design
Only for:
field event model
no-discharge model
route assignment
custody chain
governance issue object
offline sync strategy
D. Thin-slice implementation plan
One end-to-end slice:
assigned route
one outfall visit
sample collected or no discharge
evidence captured
sync completed
issue created if needed
That thin slice is the best first proof the platform can become the WV operating system.
12. Final judgment
This is the roadmap I would hand off.
It keeps the strengths of the current roadmap:
strong strategic frame
field-first orientation
governance awareness
good architecture direction
But it fixes the dangerous parts:
too much confidence in mixed current-state facts
not enough distinction between required and nice-to-have
too much surface area too early
too much risk of Codex disappearing into architecture
So the new rule is simple:
Verify first. Build the WV field-core chain second. Layer everything else after that.