# SCC Coal Mine Operating System — Modules & Agent Cards

**Version:** 1.0  
**Date:** 2026-05-18  
**Scope:** WV, VA, KY (+ SCC cross-refs for AL, TN where noted)  
**Audience:** Product, compliance, engineering  

This document extends the master operating map with:

1. **46 platform modules** (26 base + 20 gap modules)
2. **Agent cards** — name, module, inputs, outputs, RBAC, human gates, integrations
3. **Layer index** — how agents group into the command stack

**How to read an agent card**

| Field | Meaning |
|-------|---------|
| **Read** | View recommendations, dashboards, alerts |
| **Act** | Create/update tasks, drafts, logs (audit trail required) |
| **Approve** | Human-only decision; agent prepares package only |
| **Gate** | `HUMAN` = never auto-execute |

RBAC uses existing roles from `src/lib/rbac.ts`. Proposed future roles are marked `(future)`.

---

## Daily five questions (extended)

1. Are we **allowed** to operate? (permits, bonds, idle status, access)
2. Are we operating **safely**? (MSHA, state mine safety, dust, electrical, dams)
3. Are we meeting **every environmental/legal obligation**? (water, air, SMCRA, 404, decree)
4. Are we **making money** without hidden exposure? (tons, specs, cost/ton, covenants)
5. Are we compliant on **non-water programs that can stop mining tomorrow**? (air, dams, explosives, FMCSA, enforcement)

---

## Layer index

| Layer | Modules | Agent count (approx.) |
|-------|---------|------------------------|
| Command | 1, 4, 43 | 8 |
| Regulatory identity | 2, 3, 35, 42, 43 | 12 |
| Environmental — water | 5–8, 41 | 18 |
| Environmental — non-water | 27–31, 29–30 | 22 |
| Safety | 9, 36–40 | 24 |
| Production | 11–14, 34 | 16 |
| Engineering / land | 20, 32–33, 29 | 14 |
| Commercial / finance | 15–16, 22, 44 | 14 |
| Workforce / vendors | 18–19 | 10 |
| Legal / audit / EMS | 23–24, 45 | 12 |
| Data / IT / public | 25–26, 43 | 10 |
| **Total** | **46 modules** | **~120 agents** |

---

# Part A — Module catalog

## Base modules (from master map)

### M01 — Executive Command Center
**Purpose:** Single pane for operate/stop, risk, production, cash, penalties, and status by mine.  
**Primary objects:** `facility`, `mine_status`, `compliance_risk_score`, `open_escalation`, `capital_request`, `daily_executive_brief`  
**Human gates:** Idle mine, shutdown, bond release approval, force majeure denial/approval, major capex.

### M02 — Facility / Mine Registry
**Purpose:** Canonical graph of tenant → org → site → permit → monitoring point → equipment.  
**Primary objects:** `organization`, `site`, `facility_type`, `state`, `coordinates`, `parent_operator`  
**Human gates:** Facility activation, operator change.

### M03 — Permit & Regulatory Identity
**Purpose:** All permit IDs and crosswalks (SMCRA, NPDES/KPDES/VPDES, MSHA, state mine license, air, dam).  
**Primary objects:** `permit`, `permit_crosswalk`, `expiration`, `condition_extract`, `regulatory_correspondence`  
**Human gates:** Permit application signature, transfer, termination.

### M04 — Consent Decree Obligation Tracker
**Purpose:** Paragraph-level decree obligations, deadlines, evidence, quarterly certification.  
**Primary objects:** `decree_obligation`, `obligation_evidence`, `certification`, `penalty_exposure`  
**Human gates:** Quarterly certification, legal interpretation, FM notice.

### M05 — Environmental Sampling
**Purpose:** Schedules, routes, field collection, outlet inspection, GPS/temporal verification.  
**Primary objects:** `sampling_event`, `monitoring_point`, `field_measurement`, `inspection_checklist`, `photo_evidence`  
**Human gates:** Schedule changes, missed window escalation.

### M06 — Lab / EDD / DMR
**Purpose:** COC, lab receipt, EDD parse, DMR line build, portal-ready export.  
**Primary objects:** `chain_of_custody`, `lab_result`, `dmr_line_item`, `edd_import`  
**Human gates:** DMR certification (Approve).

### M07 — Exceedance & Violation Response
**Purpose:** Limit comparison, notifications, corrective actions, daily monitoring after violations.  
**Primary objects:** `exceedance`, `violation`, `corrective_action`, `daily_monitoring_plan`  
**Human gates:** Close major CA, resample strategy.

### M08 — Force Majeure / Exception Management
**Purpose:** FM intake, clocks, evidence package, resample planning.  
**Primary objects:** `force_majeure_event`, `notice_deadline`, `evidence_bundle`  
**Human gates:** **All** FM determinations (Approve).

### M09 — MSHA Safety & Training
**Purpose:** Part 48/46, exams, citations, incidents, contractor safety.  
**Primary objects:** `training_record`, `workplace_exam`, `citation`, `injury_report`  
**Human gates:** Contest citation, abatement sign-off.

### M10 — Incident / Emergency Management
**Purpose:** Incident command, notifications, evidence preservation, after-action.  
**Primary objects:** `incident`, `notification_log`, `legal_hold`, `after_action`  
**Human gates:** Fatality/serious accident notifications, restart authority.

### M11 — Mine Production (rollup)
**Purpose:** Cross-surface/UG/plant production KPIs and variance.  
**Primary objects:** `shift_production`, `tons`, `equipment_hours`, `downtime`  
**Human gates:** None routine.

### M12 — Underground Operations
**Purpose:** Sections, advance, ventilation, roof, belt, refuge, maps.  
**Primary objects:** `section`, `methane_reading`, `roof_control`, `mine_map_revision`  
**Human gates:** Panel start/stop, plan revision approval.

### M13 — Surface Operations
**Purpose:** Pit, blast, haul, spoil, roads, weather delays.  
**Primary objects:** `blast`, `pit_condition`, `shift_handoff`  
**Human gates:** Blast approval, highwall restriction.

### M14 — Prep Plant / Loadout
**Purpose:** Yield, uptime, belts, dust, loadout queues.  
**Primary objects:** `plant_shift`, `yield`, `loadout_ticket`  
**Human gates:** Plant restart after safety stop.

### M15 — Coal Quality / Customer Specs
**Purpose:** Spec compliance, blends, claims, certificates of analysis.  
**Primary objects:** `quality_sample`, `blend_recipe`, `customer_claim`  
**Human gates:** Claim settlement (Approve).

### M16 — Transportation / Dispatch
**Purpose:** Truck/rail/barge dispatch, scale tickets, demurrage.  
**Primary objects:** `dispatch`, `scale_ticket`, `shipment`  
**Human gates:** Overweight permit exceptions.

### M17 — Equipment / Maintenance / Parts
**Purpose:** Assets, PM, breakdowns, parts, fuel, calibration.  
**Primary objects:** `asset`, `work_order`, `pm_schedule`, `calibration_log`  
**Human gates:** Return-to-service on safety-critical assets.

### M18 — Workforce / Credentials / Scheduling
**Purpose:** Hiring, certs, shifts, time, access removal.  
**Primary objects:** `employee`, `credential`, `shift`, `timecard`  
**Human gates:** Termination, site access grant/revoke.

### M19 — Vendors / Procurement / Contracts
**Purpose:** Vendor compliance, PO, lab contracts, contractor performance.  
**Primary objects:** `vendor`, `contract`, `po`, `coi`  
**Human gates:** Vendor approval, contract signature.

### M20 — Land / Minerals / Royalties / Access
**Purpose:** Leases, easements, gates, boundaries, royalty math.  
**Primary objects:** `lease`, `easement`, `parcel`, `access_issue`  
**Human gates:** Boundary dispute, new easement.

### M21 — Reclamation / Bond Release
**Purpose:** Phased reclamation, bond increments, release packages.  
**Primary objects:** `reclamation_phase`, `bond`, `bond_release_application`  
**Human gates:** Bond release sign-off (Approve).

### M22 — Finance / Cost per Ton / Penalty Exposure
**Purpose:** P&L by mine, invoices, holds, severance, penalties.  
**Primary objects:** `cost_center`, `invoice`, `penalty_calc`, `payment_hold`  
**Human gates:** Capex approval, payment release on compliance hold.

### M23 — Legal / Correspondence / Privilege
**Purpose:** Matters, privilege, CBI, certifications, litigation hold.  
**Primary objects:** `legal_matter`, `correspondence`, `privilege_flag`, `litigation_hold`  
**Human gates:** All external legal submissions (Approve).

### M24 — Audit / Corrective Action / Management Review
**Purpose:** Audits, findings, RCA, management review minutes.  
**Primary objects:** `audit`, `finding`, `management_review`  
**Human gates:** Close audit, management review sign-off.

### M25 — Public Portal / Regulatory Data
**Purpose:** Public vs CBI vs privileged, FOIA, citizen data.  
**Primary objects:** `public_record`, `foia_request`, `public_dataset`  
**Human gates:** Public release approval.

### M26 — Data Governance / Integrations / Cybersecurity
**Purpose:** RBAC, audit log, ECHO/MSHA sync, data quality, OT security.  
**Primary objects:** `audit_event`, `integration_run`, `data_quality_issue`  
**Human gates:** Role grants, integration credential rotation.

---

## Gap modules (new)

### M27 — Air Quality & Fugitive Emissions (CAA)
**Purpose:** Title V / minor NSR / PSD, stack tests, opacity, fugitive PM, malfunctions.  
**Primary objects:** `air_permit`, `emission_unit`, `stack_test`, `opacity_reading`, `malfunction_report`  
**States:** WV DEP Air, VA DEQ, KY DAQ  
**Human gates:** Deviation reports, permit modifications.

### M28 — Chemical & Spill Programs (RCRA / EPCRA / SPCC)
**Purpose:** Hazardous waste, Tier II, TRI thresholds, oil spill prevention.  
**Primary objects:** `waste_manifest`, `tier_ii_inventory`, `spcc_plan`, `spill_drill`  
**Human gates:** RCRA generator status change, SPCC plan amendment.

### M29 — Watershed & Stream Permitting (404 / 401 / WQC)
**Purpose:** USACE authorizations, mitigation banks, stream crossings, compensatory acres.  
**Primary objects:** `404_permit`, `mitigation_site`, `impact_acreage`, `wqc_condition`  
**Human gates:** New fill, mitigation debit approval.

### M30 — Biological & Cultural Resources
**Purpose:** ESA seasonal buffers, surveys, NHPA Section 106, discovery protocols.  
**Primary objects:** `species_buffer`, `cultural_clearance`, `discovery_event`  
**Human gates:** Inadvertent discovery stop-work.

### M31 — Impoundments & Dam Safety
**Purpose:** Slurry/refuse dams, EOR, inspections, EAP, geotech instrumentation.  
**Primary objects:** `impoundment`, `piezometer_reading`, `eap_drill`, `dam_inspection`  
**Human gates:** Hazard classification change, pool raise.

### M32 — SMCRA Active Mining Performance
**Purpose:** Contemporaneous reclamation, AOC, excess spoil, OSMRE/state inspections.  
**Primary objects:** `disturbed_acre`, `backfill_status`, `smcra_inspection`, `contemporaneous_milestone`  
**Human gates:** Mining plan revision, variance requests.

### M33 — Subsidence & Third-Party Protection
**Purpose:** Subsidence plans, structure surveys, damage claims, water supply replacement (VA).  
**Primary objects:** `structure_inventory`, `subsidence_prediction`, `damage_claim`  
**Human gates:** Settlement offers, panel under structures.

### M34 — Exploration & Pre-Mining Clearance
**Purpose:** Drill permits, core logs, pre-SMCRA clearances.  
**Primary objects:** `exploration_permit`, `drill_hole`, `clearance_status`  
**Human gates:** Disturbance before full permit.

### M35 — Facility Lifecycle & Operator Status
**Purpose:** Active, idle, care & maintenance, cessation, transfer, successor liability.  
**Primary objects:** `operational_status`, `cessation_notice`, `operator_transfer`, `successor_liability_register`  
**Human gates:** Idle declaration, operator change.

### M36 — Explosives & Seismograph Compliance
**Purpose:** ATF magazines, inventory, blaster certs, vibration/airblast.  
**Primary objects:** `magazine_inventory`, `shot_record`, `seismograph_reading`  
**Human gates:** Theft/loss report, blast delay for community.

### M37 — Respirable Dust & Occupational Health
**Purpose:** Dust sampling, Part 90, audiograms, black lung surveillance.  
**Primary objects:** `dust_sample`, `validogram`, `audiogram`, `health_surveillance`  
**Human gates:** POV mitigation plan approval.

### M38 — MSHA Electrical, Roof & Ventilation Programs
**Purpose:** Deep MSHA programs beyond generic safety module.  
**Primary objects:** `electrical_exam`, `roof_plan`, `ventilation_survey`, `red_tag`  
**Human gates:** Roof control plan change, belt air revision.

### M39 — State Mine Safety Programs (WV / KY / VA)
**Purpose:** State inspectorate, state certs (foreman, electrician, shotfirer).  
**Primary objects:** `state_citation`, `state_certification`  
**Human gates:** State exam/cert renewal.

### M40 — Commercial Motor Carrier (FMCSA / DOT)
**Purpose:** CDL, med cards, HOS, DVIR, CSA — separate from dispatch.  
**Primary objects:** `driver_qualification`, `dvir`, `hos_log`, `csa_score`  
**Human gates:** Out-of-service override.

### M41 — Groundwater & Receiving Water Quality
**Purpose:** GW wells, WET tests, selenium/conductivity, 303(d)/TMDL context.  
**Primary objects:** `groundwater_well`, `wet_test`, `receiving_water_assessment`  
**Human gates:** Statistical permit limit changes.

### M42 — Regulatory Portal & Certified Submission Ops
**Purpose:** NetDMR, eDMR, MyTDEC, E2DMR — credentials, submit, reject, proof.  
**Primary objects:** `portal_credential`, `submission_receipt`, `rejection_reason`  
**Human gates:** Certified submit (Approve).

### M43 — Master Obligation & Enforcement Hub
**Purpose:** All permit clauses + all enforcement sources → one CA pipeline.  
**Primary objects:** `obligation_clause`, `enforcement_action`, `unified_deadline`  
**Human gates:** Obligation waiver, enforcement settlement.

### M44 — Production Reporting & Legal Metrology
**Purpose:** MSHA 7000-2, state production/tax forms, certified scales.  
**Primary objects:** `production_report`, `scale_certification`, `tonnage_reconciliation`  
**Human gates:** Scale certification appeal, amended production filing.

### M45 — EMS, MOC & Management Review System
**Purpose:** ISO 14001-style document control, MOC, objectives, training matrix.  
**Primary objects:** `controlled_document`, `moc_request`, `objective`, `training_need`  
**Human gates:** MOC approval, management review chair sign-off.

### M46 — OT Security & Mine Automation
**Purpose:** SCADA, telemetry, patch cadence, OT incident response.  
**Primary objects:** `ot_asset`, `scada_tag`, `ot_incident`  
**Human gates:** Remote control enable, OT firewall change.

---

# Part B — Agent cards by module

Card format is consistent below. Agents marked **(new)** were missing from the original ~70-agent swarm.

---

## M01 — Executive Command Center

### Executive Command Agent
| | |
|---|---|
| **Module** | M01 |
| **Purpose** | Daily answer: allowed, safe, compliant, profitable. |
| **Inputs** | All module risk scores, production, open enforcement, FM clocks, bond status |
| **Outputs** | Executive brief, red/yellow/green by mine, recommended escalations |
| **Read** | `EXECUTIVE_DASHBOARD_ROLES`, `ceo_view` |
| **Act** | `coo`, `executive`, `admin` — assign escalations only |
| **Approve** | — |
| **Integrations** | All modules |
| **Gate** | Recommends only; no operational stops |

### Governance Escalation Agent
| | |
|---|---|
| **Module** | M01 |
| **Purpose** | Route issues to owner; detect stale escalations. |
| **Inputs** | `open_escalation`, org chart, role assignments |
| **Outputs** | Reassignment tasks, stale alerts, authority log |
| **Read** | `GOVERNANCE_ROUTE_ROLES` |
| **Act** | `coo`, `environmental_manager`, `admin` |
| **Approve** | `executive` for level-3 escalations |
| **Integrations** | M23, M43 |
| **Gate** | Cannot close escalation without human |

### Board / Owner Briefing Agent
| | |
|---|---|
| **Module** | M01 |
| **Purpose** | Weekly narrative for owners/board. |
| **Inputs** | M01 brief, M22 penalty exposure, M07 violations |
| **Outputs** | PDF/markdown brief with disclaimer one-liner |
| **Read** | `ceo_view`, `executive`, `coo` |
| **Act** | `coo`, `admin` — generate only |
| **Approve** | `executive` before external send |
| **Integrations** | Report export pipeline |
| **Gate** | External distribution Approve |

### Penalty Exposure Agent (rollup)
| | |
|---|---|
| **Module** | M01, M22 |
| **Purpose** | Aggregate decree, NPDES, MSHA, SMCRA penalty models. |
| **Inputs** | Missed samples, violations, citation history |
| **Outputs** | `$ exposure` ranges, trend, top 5 drivers |
| **Read** | `EXECUTIVE_DASHBOARD_ROLES`, `chief_counsel` |
| **Act** | `compliance_reviewer`, `coo` — scenario tags only |
| **Approve** | — |
| **Integrations** | M04, M07, M08, M09 |
| **Gate** | Estimates only; legal confirms |

---

## M02 — Facility / Mine Registry

### Facility Registry Agent
| | |
|---|---|
| **Module** | M02 |
| **Purpose** | Keep facility graph consistent. |
| **Inputs** | Org/site CRUD, permit links, GPS |
| **Outputs** | Validation errors, orphan permits, duplicate IDs |
| **Read** | `COMPLIANCE_FULL_ROLES` |
| **Act** | `admin`, `environmental_manager` |
| **Approve** | `executive` for new facility activation |
| **Integrations** | M03, GIS |
| **Gate** | Activation HUMAN |

---

## M03 — Permit & Regulatory Identity

### Permit Inventory Agent
| | |
|---|---|
| **Module** | M03 |
| **Purpose** | Master permit truth table. |
| **Inputs** | Permit uploads, state feeds, manual entry |
| **Outputs** | Permit registry, status dashboard |
| **Read** | `COMPLIANCE_FULL_ROLES` |
| **Act** | `environmental_manager`, `admin`, `compliance_reviewer` |
| **Approve** | Permit transfer/mod termination |
| **Integrations** | parse-permit-pdf, M42 |
| **Gate** | Regulatory submission Approve |

### Permit Crosswalk Agent
| | |
|---|---|
| **Module** | M03 |
| **Purpose** | Map SMCRA/DMLR/DNR ↔ NPDES ↔ MSHA ↔ air/dam IDs. |
| **Inputs** | Internal IDs, ECHO, state portals |
| **Outputs** | Crosswalk table, mismatch alerts |
| **Read** | `COMPLIANCE_DB_ROLES` |
| **Act** | `compliance_reviewer`, `admin` |
| **Approve** | — |
| **Integrations** | sync-echo-data, VA DMLR vs NPDES fix |
| **Gate** | — |

### Renewal Deadline Agent
| | |
|---|---|
| **Module** | M03 |
| **Purpose** | Expiration windows for all permit types. |
| **Inputs** | `permit.expiration`, renewal rules by state |
| **Outputs** | 90/60/30-day alerts, renewal task list |
| **Read** | `COMPLIANCE_FULL_ROLES` |
| **Act** | Creates renewal tasks |
| **Approve** | Renewal package sign-off |
| **Integrations** | M22 payment holds |
| **Gate** | Submission Approve |

### Regulatory Identity Agent
| | |
|---|---|
| **Module** | M03 |
| **Purpose** | Prevent ID mismatches across EPA, state, internal, DMR. |
| **Inputs** | ECHO, DMR history, internal registry |
| **Outputs** | Discrepancy tickets |
| **Read** | `COMPLIANCE_DB_ROLES` |
| **Act** | `compliance_reviewer` |
| **Approve** | — |
| **Integrations** | detect-discrepancies, ECHO |
| **Gate** | — |

### Permit Modification Agent
| | |
|---|---|
| **Module** | M03 |
| **Purpose** | Track outfall/limit/acreage/plan changes. |
| **Inputs** | Mod applications, approved orders |
| **Outputs** | Diff log, downstream obligation updates |
| **Read** | `COMPLIANCE_ADVANCED_ROLES` |
| **Act** | `environmental_manager`, `compliance_reviewer` |
| **Approve** | Mod signature |
| **Integrations** | M05 schedules, M43 obligations |
| **Gate** | HUMAN sign |

---

## M04 — Consent Decree Obligation Tracker

### Consent Decree Control Agent
| | |
|---|---|
| **Module** | M04 |
| **Purpose** | Map activities to decree paragraphs and evidence. |
| **Inputs** | Decree text, sampling, inspections, reports |
| **Outputs** | Obligation status, gap list, evidence checklist |
| **Read** | `GOVERNANCE_ROUTE_ROLES`, `chief_counsel` |
| **Act** | `compliance_reviewer`, `environmental_manager` |
| **Approve** | Quarterly certification |
| **Integrations** | M05–M08, M24 |
| **Gate** | Certification HUMAN |

### Obligation Tracker Agent (decree + all permits)
| | |
|---|---|
| **Module** | M04, M43 |
| **Purpose** | Unified deadline calendar. |
| **Inputs** | Parsed permit clauses, decree, training, bonds |
| **Outputs** | `unified_deadline`, owner, evidence link |
| **Read** | `COMPLIANCE_FULL_ROLES` |
| **Act** | Auto-create tasks; humans own completion |
| **Approve** | Waiver/extension |
| **Integrations** | All compliance modules |
| **Gate** | Waiver HUMAN |

---

## M05 — Environmental Sampling

### Sampling Schedule Agent
### Route Optimization Agent
### Field Sampling Agent
### Outlet Inspection Agent
### Weather / Rain Event Agent

*(Existing swarm — see platform implementation in rain events, field routes, outlet inspection.)*

| Agent | Read | Act | Approve |
|-------|------|-----|---------|
| Sampling Schedule | `FIELD_SCHEDULE_ROLES` | `environmental_manager`, `wv_supervisor` | Schedule change |
| Route Optimization | `FIELD_ROUTE_ROLES` | `wv_supervisor`, `float_sampler` | — |
| Field Sampling | `FIELD_ROUTE_ROLES` | `field_sampler`, `float_sampler` | — |
| Outlet Inspection | `FIELD_ROUTE_ROLES` | `field_sampler` | Deficiency sign-off |
| Rain Event | `RAIN_EVENT_*` roles | declare/dismiss per rbac.ts | Exemption approve |

### Field Meter Calibration Agent **(new)**
| | |
|---|---|
| **Module** | M05, M17 |
| **Purpose** | pH/DO/conductivity standards and due dates. |
| **Inputs** | `calibration_log`, meter asset ID |
| **Outputs** | Block field use if expired; task to maintenance |
| **Read** | `FIELD_ROUTE_ROLES`, `maintenance_owner` |
| **Act** | `maintenance_owner`, `environmental_manager` |
| **Approve** | — |
| **Integrations** | M17 |
| **Gate** | — |

### Field QA/QC Agent **(new)**
| | |
|---|---|
| **Module** | M05, M06 |
| **Purpose** | Blanks, duplicates, hold times, bottle decon between sites. |
| **Inputs** | Sample metadata, lab QC flags |
| **Outputs** | QC failure alerts, resample recommendations |
| **Read** | `COMPLIANCE_FULL_ROLES`, `lab_liaison` |
| **Act** | `lab_liaison`, `compliance_reviewer` |
| **Approve** | Invalidate sample set |
| **Integrations** | M06 |
| **Gate** | Invalidate HUMAN |

---

## M06 — Lab / EDD / DMR

### Chain of Custody Agent
### Lab EDD Agent
### DMR Agent

| Agent | Read | Act | Approve |
|-------|------|-----|---------|
| Chain of Custody | `COMPLIANCE_FULL_ROLES` | `field_sampler`, `courier`, `lab_liaison` | — |
| Lab EDD | `COMPLIANCE_UPLOAD_ROLES` | `lab_liaison`, `lab_tech` | — |
| DMR | `DMR_SUBMISSION_ROLES` | build draft | **DMR certification** |

### Portal Submission Agent **(new)**
| | |
|---|---|
| **Module** | M06, M42 |
| **Purpose** | Submit to NetDMR/eDMR/MyTDEC/E2DMR; track receipt/rejection. |
| **Inputs** | DMR export, portal credentials |
| **Outputs** | `submission_receipt`, retry tasks |
| **Read** | `DMR_SUBMISSION_ROLES` |
| **Act** | `compliance_reviewer`, `lab_liaison` — stage only |
| **Approve** | Certified submitter |
| **Integrations** | State portals (RPA or API where available) |
| **Gate** | **Certification HUMAN** |

---

## M07 — Exceedance & Violation Response

### Exceedance Agent
### Deficiency Remediation Agent
### Water Treatment Agent **(new)**
### Pond / Sediment Control Agent

| Agent | Module | Purpose |
|-------|--------|---------|
| Exceedance | M07 | Compare results to limits; notify |
| Deficiency Remediation | M07 | 30-day outlet/pond/signage CAs |
| Water Treatment | M07, M32 | Active treatment O&M, chemical dosing |
| Pond / Sediment | M07, M31 | Pond inspections, freeboard, markers |

---

## M08 — Force Majeure / Exception Management

### Exception Intake Agent
### Force Majeure Clock Agent
### Evidence Completeness Agent
### Legal Routing Agent

| Agent | Act | Approve |
|-------|-----|---------|
| Exception Intake | `field_sampler`, `wv_supervisor`, `site_manager` | — |
| FM Clock | all compliance roles read | — |
| Evidence Completeness | prepares package | — |
| Legal Routing | routes to counsel | **FM determination** |

**Gate:** All four agents are **prepare-only** for final FM status; `environmental_manager` + `chief_counsel` Approve.

---

## M09 — MSHA Safety & Training

### MSHA Training Agent
### Safety Inspection Agent
### Citation / Abatement Agent
### Incident Reporting Agent
### Contractor Safety Agent
### PPE / Hazard Agent

| Agent | Read | Act | Approve |
|-------|------|-----|---------|
| MSHA Training | `TRAINING_ADMIN_ROLES` | training admin | — |
| Safety Inspection | `INCIDENT_ROLES` | `safety_manager`, `site_manager` | — |
| Citation / Abatement | `INCIDENT_ROLES` | abatement evidence upload | contest/close |
| Incident Reporting | `INCIDENT_ROLES` | create incident | MSHA immediate notify |
| Contractor Safety | `site_manager` | orientation block | vendor authorize |
| PPE / Hazard | `safety_manager` | hazard log | — |

### Mine Rescue Agent **(new)**
| | |
|---|---|
| **Module** | M09, M10 |
| **Purpose** | Part 49 team roster, drills, cache inspections. |
| **Inputs** | Team roster, drill schedule |
| **Outputs** | Drill gap alerts |
| **Read** | `safety_manager`, `site_manager` |
| **Act** | `safety_manager` |
| **Approve** | — |
| **Gate** | — |

---

## M10 — Incident / Emergency Management

### Incident Command Agent
### Emergency Notification Agent
### Evidence Preservation Agent
### After-Action Agent

### Regulatory Notification Matrix Agent **(new)**
| | |
|---|---|
| **Module** | M10 |
| **Purpose** | By incident type × state: MSHA, EPA spill, DEP hotline, dam EAP, railroad. |
| **Inputs** | `incident.type`, `site.state`, severity |
| **Outputs** | Checklist with deadlines, draft notices |
| **Read** | `EMERGENCY_ROLES` |
| **Act** | `safety_manager`, `environmental_manager` — log notifications |
| **Approve** | `executive`, `chief_counsel` for external agency contact |
| **Gate** | **All regulator notifications Approve** |

---

## M11–M14 — Production stack

| Agent | Module | Inputs | Outputs | Act roles |
|-------|--------|--------|---------|-----------|
| Surface Production | M13 | shift logs | tons variance | `site_manager` |
| Underground Section | M12 | section map | advance vs plan | `site_manager` |
| Drill & Blast | M13, M36 | blast plan | powder factor, exclusions | `site_manager` Approve blast |
| Pit Conditions | M13 | inspections | water/highwall/roads | `site_manager` |
| Shift Handoff | M11–13 | shift notes | next-shift tasks | supervisors |
| Ventilation | M12, M38 | air readings | overrides | `safety_manager` |
| Roof Control | M12, M38 | bolt logs | plan conflicts | `safety_manager` Approve plan change |
| Belt / Haulage | M12 | belt exams | fire risk score | `safety_manager` |
| Prep Plant | M14 | plant SCADA/手动 | yield, downtime | `site_manager` |
| Coal Quality | M15 | lab prox/ultimate | spec flags | `environmental_manager` |
| Loadout | M14, M16 | queue, scales | tickets | dispatch |
| Stockpile | M14, M15 | pile temps | hot spot alert | `site_manager` |
| Stockpile Combustion Agent **(new)** | M14 | temp probes | turnover schedule | `maintenance_owner` |
| Longwall / Panel Sequence Agent **(new)** | M12 | panel map | subsidence/ventilation triggers | `site_manager` Approve panel start |
| Mine Map Certification Agent **(new)** | M12 | survey | MSHA map due | `site_manager` Approve cert |

---

## M15–M16 — Commercial transport

| Agent | Module | Purpose |
|-------|--------|---------|
| Sales Contract | M15 | Commitments, price, volume |
| Spec Compliance | M15 | Shipment vs contract |
| Blend Optimization | M15 | Stockpile blend recommend |
| Customer Claims | M15 | Rejections, credits |
| Truck Dispatch | M16 | Routes, queues |
| Scale Ticket | M16, M44 | Reconcile tons |
| Rail / Barge | M16 | Demurrage, car orders |
| Haul Road | M16, M13 | Road condition, dust |

---

## M17 — Equipment / Maintenance

| Agent | Purpose |
|-------|---------|
| Asset Registry | All equipment + meters + tablets |
| Preventive Maintenance | PM schedules |
| Breakdown | Downtime + production impact |
| Parts Inventory | Critical spares |
| Fuel / Tire / Consumables | Burn rates |
| Meter Calibration | Lab/field meters |

---

## M18–M19 — Workforce & vendors

| Agent | Module | Approve gates |
|-------|--------|---------------|
| Workforce Scheduling | M18 | Overtime blackout |
| Credentialing | M18 | Site access grant |
| Payroll / Time | M18 | — |
| Access Removal | M18 | **Termination access revoke HUMAN** |
| Vendor Compliance | M19 | COI, MSHA orient |
| Procurement | M19 | PO approval chain |
| Lab Contract | M19, M06 | SLA breach |
| Contractor Performance | M19 | Vendor removal |

### Part 48 / Part 46 Training Agent **(new)**
| | |
|---|---|
| **Module** | M18, M09 |
| **Purpose** | Distinct from HR onboarding; blocks site without current Part 48. |
| **Inputs** | Training plan, MSHA IDs |
| **Outputs** | Access block list |
| **Act** | `TRAINING_ADMIN_ROLES` |
| **Gate** | Task training authorization HUMAN |

### DOT Drug & Alcohol Pool Agent **(new)**
| | |
|---|---|
| **Module** | M18, M40 |
| **Purpose** | Separate MSHA vs FMCSA testing pools. |
| **Inputs** | Role, CDL status |
| **Outputs** | Test schedule, SAP return tracking |
| **Act** | `admin`, `safety_manager` |

---

## M20 — Land / Minerals

| Agent | Purpose |
|-------|---------|
| Land Rights | Leases, ownership |
| Access Control | Gates, keys, denials |
| Royalty | Production × lease terms |
| Boundary / GIS | Permit vs parcel vs outfall |
| Timber / Pre-clear Agent **(new)** | State timber permits before grubbing |

---

## M21 — Reclamation / Bond

| Agent | Purpose |
|-------|---------|
| Reclamation Plan | Phase/acre obligations |
| Bond Release | Release evidence package |
| Revegetation | Survival, maintenance |
| Long-Term Treatment | AMD perpetual care |
| Contemporaneous Reclamation Agent **(new)** | M32 — active mining backfill/topsoil pace |
| PMLU Agent **(new)** | Post-mining land use vs bond phase |

---

## M22 — Finance

| Agent | Purpose |
|-------|---------|
| Mine P&L | Cost/ton, margin |
| Invoice Risk | Unpaid lab/fuel/parts threatens ops |
| Royalty / Severance Tax | State production reports |
| Insurance / Bonding | Policies, surety narrative |
| Banking Covenant Agent **(new)** | Covenant cert inputs from violations/production |
| Commodity Hedge Agent **(new)** | Hedge book vs shipments (future finance role) |
| Payment Hold Agent **(new)** | VA/WV license holds tied to missed filings |

---

## M23–M25 — Legal & public

| Agent | Module | Gate |
|-------|--------|------|
| Legal Matter | M23 | — |
| Regulatory Correspondence | M23 | Outbound Approve |
| Privilege / CBI | M23 | Release Approve |
| Certification | M04, M06 | Report cert Approve |
| Public Portal | M25 | Public dataset Approve |
| Public Records / FOIA | M25 | Response Approve |
| Complaint Intake | M25 | — |
| Community Response | M25 | Close complaint |
| Citizen Suit Watch **(new)** | M25, M43 | Counsel review |
| Litigation Hold Agent **(new)** | M23, M26 | `LEGAL_HOLD_ROLES` only |

---

## M26 — Data governance

| Agent | Purpose |
|-------|---------|
| Identity / RBAC | Users, roles, site scope |
| Audit Log | Immutable client+server events |
| Data Quality | Missing IDs, duplicates |
| Integration Health | ECHO, MSHA, weather, EDD |
| Cybersecurity | Auth anomalies |
| Evidence Preservation | Legal hold on deletes |
| OT Security Agent **(new)** | M46 — SCADA patch, OT incidents |

---

## M27 — Air quality **(new module)**

### Air Compliance Agent
| | |
|---|---|
| **Inputs** | Title V/minor permits, stack tests, CEMS |
| **Outputs** | Deviation drafts, renewal tasks, exceedance alerts |
| **Read** | `COMPLIANCE_FULL_ROLES` |
| **Act** | `environmental_manager`, `compliance_reviewer` |
| **Approve** | Deviation report sign, malfunction report |
| **Integrations** | M03, M43 |

### Fugitive Dust / Opacity Agent
| | |
|---|---|
| **Inputs** | Opacity logs, water truck runs, wind, production |
| **Outputs** | Dust control tasks, link to community complaints |
| **Read** | `site_manager`, `environmental_manager` |
| **Act** | `site_manager` |
| **Approve** | — |
| **Integrations** | M13 haul road, M25 complaints |

---

## M28 — Chemical & spill programs **(new)**

| Agent | Inputs | Outputs | Approve |
|-------|--------|---------|---------|
| RCRA Generator | waste volumes, manifests | generator status alert | status change |
| EPCRA Tier II | chemical inventory, purchases | filing draft | annual cert |
| SPCC | tank diagram, inspections | monthly inspection tasks | plan amendment |

---

## M29 — Watershed & 404 **(new)**

| Agent | Purpose |
|-------|---------|
| Wetlands / 404 Agent | Permit acres, JD, nationwide vs individual |
| Mitigation Bank Steward | Comp acre balance, maintenance years |
| Stream Crossing Agent | Crossing schedule vs mine sequence |

---

## M30 — Biological & cultural **(new)**

| Agent | Purpose | Gate |
|-------|---------|------|
| Species / Seasonal Blackout | ESA buffers on blast/disturbance | Stop-work |
| Cultural / Section 106 | SHPO clearance before disturbance | Discovery protocol HUMAN |

---

## M31 — Impoundments & dam safety **(new)**

| Agent | Purpose | Gate |
|-------|---------|------|
| Dam Safety / Impoundment | Inspections, EOR, hazard class | Pool raise Approve |
| Geotech Instrumentation | Piezometer/inclinometer trends | EAP drill |
| Refuse Area QA (non-impoundment) | Lift logs, compaction tests | — |

---

## M32 — SMCRA active mining **(new)**

| Agent | Purpose |
|-------|---------|
| SMCRA Performance | Contemporaneous milestones, inspections |
| Valley Fill / Highwall Geotech | Slope stability, rainfall triggers |
| OSMRE / State Inspection | Normalize inspection PDFs to CA |

---

## M33 — Subsidence **(new)**

| Agent | Purpose | Gate |
|-------|---------|------|
| Subsidence & Structure | Panel vs structure map, notices | Damage settlement |
| VA Water Supply Agent | VA-specific replacement obligations | Legal Approve |

---

## M34 — Exploration **(new)**

| Agent | Purpose | Gate |
|-------|---------|------|
| Exploration Gatekeeper | Drill permit + 404/106 before pad | Disturbance HUMAN |

---

## M35 — Facility lifecycle **(new)**

| Agent | Purpose | Gate |
|-------|---------|------|
| Idle / Cessation Mode | Rule pack when status → idle | Cessation notice Approve |
| Operator Transfer | Successor liability checklist | Transfer Approve |
| Contract Operator Scope | MSHA responsibility split | — |

---

## M36 — Explosives **(new)**

| Agent | Purpose | Gate |
|-------|---------|------|
| ATF Magazine & Inventory | Daily magazine log vs shots | Theft/loss **immediate HUMAN** |
| Blast Seismograph | Vibration vs complaints | Blast delay Approve |

---

## M37 — Dust & occupational health **(new)**

| Agent | Purpose | Gate |
|-------|---------|------|
| Respirable Dust / Silica | Validograms, trends, POV risk | POV plan Approve |
| Occupational Health | Audiograms, black lung surveillance | — |

---

## M38 — MSHA deep programs **(new)**

| Agent | Purpose | Gate |
|-------|---------|------|
| Electrical Exam | Weekly/monthly exams, red tags | Energize HUMAN |
| Roof Control Plan | Plan vs advance | Plan revision Approve |
| Ventilation / Belt Air | Air quantity, methane | — |
| DPM | Engine roster vs plan | — |

---

## M39 — State mine safety **(new)**

| Agent | Purpose |
|-------|---------|
| WV MHST Agent | State citations, certs |
| KY DMS Agent | Foreman/shotfirer/electrician licenses |
| VA DM Agent | State mine exams (parallel MSHA) |

---

## M40 — FMCSA **(new)**

| Agent | Purpose | Gate |
|-------|---------|------|
| Driver Qualification | Med card, CDL, MVR | OOS override HUMAN |
| DVIR / HOS | Pre/post trip, hours | — |
| CSA Monitor | Carrier score trends | — |

---

## M41 — Groundwater & receiving water **(new)**

| Agent | Purpose |
|-------|---------|
| Groundwater Network | Well readings, statistical compliance |
| WET / Toxicity | Whole effluent test schedule |
| Receiving Water / TMDL | 303(d) context for limits |
| Selenium / Conductivity | Appalachian parameter watch |

---

## M42 — Regulatory portals **(new)**

| Agent | Purpose | Gate |
|-------|---------|------|
| Portal Credential | NetDMR/eDMR/MyTDEC/E2DMR cred expiry | Rotate creds |
| Certified Mail / Submission Proof | Tracking numbers, screenshots | — |

*(Portal Submission Agent card in M06.)*

---

## M43 — Master obligation & enforcement **(new)**

| Agent | Purpose |
|-------|---------|
| Permit Clause Parser | SMCRA/CAA/404/NPDES → obligation objects |
| Unified Enforcement Inbox | MSHA + state + EPA + OSMRE → one CA |
| Corrective Action (shared) | Existing CA module — feed all sources |
| Root Cause | Structured RCA |
| Management Review | Annual trend pack for M45 |

---

## M44 — Production reporting & metrology **(new)**

| Agent | Purpose | Gate |
|-------|---------|------|
| Legal Metrology | Scale seal expiry | Block billing if expired |
| MSHA/OSMRE Production Report | 7000-2, state tonnage reconcile | Amended filing Approve |
| Tonnage Reconciliation | Mine vs plant vs rail vs royalty |

---

## M45 — EMS & MOC **(new)**

| Agent | Purpose | Gate |
|-------|---------|
| Document Control | SOP versions, approval workflow | Publish Approve |
| MOC Agent | Process change impact on permits | MOC Approve |
| Training Needs Matrix | Role → required training |
| Management Review Chair | ISO-style annual review pack | Chair sign-off |

---

## M46 — OT security **(new)**

| Agent | Purpose | Gate |
|-------|---------|------|
| OT Asset Inventory | SCADA, PLCs, telemetry | — |
| OT Patch / Vulnerability | CVE on OT assets | Production window Approve |
| OT Incident | Ransomware, unauthorized change | Isolate HUMAN |

---

# Part C — Module ↔ agent matrix (quick reference)

| Module | Agent count | New agents |
|--------|-------------|------------|
| M01 | 4 | 0 |
| M02 | 1 | 0 |
| M03 | 5 | 0 |
| M04 | 2 | 0 |
| M05 | 7 | 2 |
| M06 | 4 | 1 |
| M07 | 4 | 1 |
| M08 | 4 | 0 |
| M09 | 6 | 1 |
| M10 | 5 | 1 |
| M11–14 | 14 | 4 |
| M15–16 | 8 | 0 |
| M17 | 6 | 0 |
| M18–19 | 10 | 2 |
| M20 | 5 | 1 |
| M21 | 6 | 2 |
| M22 | 7 | 3 |
| M23–25 | 10 | 3 |
| M26 | 7 | 1 |
| M27 | 2 | 2 |
| M28 | 3 | 3 |
| M29 | 3 | 3 |
| M30 | 2 | 2 |
| M31 | 3 | 3 |
| M32 | 3 | 3 |
| M33 | 2 | 2 |
| M34 | 1 | 1 |
| M35 | 3 | 3 |
| M36 | 2 | 2 |
| M37 | 2 | 2 |
| M38 | 4 | 4 |
| M39 | 3 | 3 |
| M40 | 3 | 3 |
| M41 | 4 | 4 |
| M42 | 2 | 2 |
| M43 | 5 | 5 |
| M44 | 3 | 3 |
| M45 | 4 | 4 |
| M46 | 3 | 3 |

---

# Part D — Implementation phasing (SCC product)

Aligns with current build focus (water / decree) vs gap modules.

| Phase | Modules | Rationale |
|-------|---------|-----------|
| **Now (built/in flight)** | M02–M08, M24 (partial), M26 (ECHO) | Upload dashboard, sampling, DMR, FM, CA, audit |
| **Next 1** | M03 crosswalk, M42, M43, M44 metrology | VA NPDES ID fix, portal proof, unified enforcement |
| **Next 2** | M09 MSHA sync, M31 dams, M32 SMCRA | Blocked on mine IDs; high catastrophic risk |
| **Next 3** | M27 air, M28 EPCRA/SPCC, M29–M30 | Non-water stop-work permits |
| **Next 4** | M11–M16 production, M22 finance | Ops ERP layer |
| **Later** | M45 EMS, M46 OT, hedge/covenant | Enterprise maturity |

**AL / TN:** Keep M03, M32, M41 parsers on roadmap (`DATA_REQUEST_TN_VA.md` OSMRE quarterly).

---

# Part E — Proposed RBAC extensions (future)

When production/safety modules ship, add role groups to `rbac.ts`:

| Role (future) | Modules |
|---------------|---------|
| `production_manager` | M11–M14, M44 |
| `prep_plant_operator` | M14 |
| `blaster` | M13, M36 |
| `dam_engineer` | M31 |
| `air_compliance` | M27 |
| `land_agent` | M20, M29 |

Until then, map to `site_manager`, `safety_manager`, `environmental_manager`, `maintenance_owner`.

---

# Part F — Non-negotiable human gates (system-wide)

Agents **must not** auto-execute:

1. Force majeure grant/deny  
2. DMR / quarterly / certified regulatory submit  
3. Consent Decree certification  
4. Permit application / transfer / termination sign  
5. Bond release approval  
6. MSHA citation contest / serious accident notify  
7. Mining shutdown or restart after serious incident  
8. Blast approval when seismograph/community threshold exceeded  
9. Dam pool raise or hazard reclassification  
10. Public or CBI release  
11. Legal external correspondence  
12. Customer claim settlement  
13. FMCSA out-of-service override  
14. OT production system changes  
15. Idle/cessation regulatory notice  

---

*Generated for SCC Compliance Monitor — planning artifact. Not legal or environmental consulting.*
