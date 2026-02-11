-- ============================================================================
-- Migration 006: Seed roadmap_tasks table with SCC Roadmap v3 tasks
-- Generated: 2026-02-10
-- Source: SCC_Roadmap_v3_All_Tasks.csv (180 tasks across 5 phases)
-- Organization: Southern Coal Corporation (2bffc35c-e2c4-4396-868f-207f80e1e2c4)
-- ============================================================================

BEGIN;

INSERT INTO roadmap_tasks (organization_id, task_id, phase, section, task_description, owner_type, depends_on, status, is_new_v3, notes)
VALUES
  -- ==========================================================================
  -- Phase 1, Section 1A: Corporate Structure & Personnel
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.01', 1, '1A', 'Confirm full legal name of parent company (as it appears on Consent Decree)', 'tom', NULL, 'not_started', false, 'Needed for EMS cover page and all regulatory submissions'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.02', 1, '1A', 'Get complete list of all 26 subsidiaries with legal names', 'tom', NULL, 'not_started', false, 'Already seeded in DB but need to verify names match CD exactly'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.03', 1, '1A', 'For each subsidiary: active, in reclamation, or closed?', 'tom', ARRAY['1.02'], 'not_started', false, 'Determines which facilities need active monitoring'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.04', 1, '1A', 'Get mailing address for parent company (for EMS and regulatory filings)', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.05', 1, '1A', 'Identify the Chief Executive / COO (name, title, email, phone) — signs quarterly reports to court', 'tom', NULL, 'not_started', false, 'REQUIRED for EMS Section 2 and Section 3'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.06', 1, '1A', 'Identify Corporate Environmental Director (or equivalent) — primary EPA liaison, oversees EMS', 'scc_mgmt', NULL, 'not_started', false, 'If this role doesn''t exist yet, who will fill it?'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.07', 1, '1A', 'Identify Corporate Legal Counsel who interprets Consent Decree obligations', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.08', 1, '1A', 'Identify Compliance System Administrator (will manage the software day-to-day)', 'both', NULL, 'not_started', false, 'Could be you initially'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.09', 1, '1A', 'For EACH active facility: name the Site Manager', 'scc_mgmt', ARRAY['1.03'], 'not_started', false, 'Every facility needs a named responsible person'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.10', 1, '1A', 'For EACH active facility: name the Environmental Manager (day-to-day compliance)', 'scc_mgmt', ARRAY['1.03'], 'not_started', false, 'This person reviews DMRs and handles exceedance notifications'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.11', 1, '1A', 'For EACH active facility: name the Field Sampler(s)', 'scc_mgmt', ARRAY['1.03'], 'not_started', false, 'Who physically collects water samples'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.12', 1, '1A', 'For EACH active facility: name backup/designee for each critical role', 'scc_mgmt', ARRAY['1.09–1.11'], 'not_started', false, 'Who covers when someone is out sick/vacation?'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.13', 1, '1A', 'Verify PE (Professional Engineer) licenses are current for anyone signing DMRs', 'scc_mgmt', ARRAY['1.10'], 'not_started', false, 'DMR signer certifies under penalty of law'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.14', 1, '1A', 'Verify MSHA certifications current for all Safety Managers', 'scc_mgmt', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.15', 1, '1A', 'Define who makes the 24-hour phone call to each state agency when an exceedance occurs', 'scc_mgmt', ARRAY['1.10'], 'not_started', false, 'CRITICAL — must be specific named person per state per facility'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.16', 1, '1A', 'Define who writes the 5-day written notification for each state', 'scc_mgmt', ARRAY['1.10'], 'not_started', false, 'Usually Environmental Manager but must be confirmed'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.17', 1, '1A', 'Define who is the authorized DMR signer for each state', 'scc_mgmt', ARRAY['1.10', '1.13'], 'not_started', false, 'Must be duly authorized representative with legal certification'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.18', 1, '1A', 'Define who signs/submits the quarterly Consent Decree report to EPA/DOJ/Court', 'scc_mgmt', ARRAY['1.05', '1.06'], 'not_started', false, 'Typically COO or Corp Environmental Director'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.19', 1, '1A', 'Define escalation chain: who gets called at 2 AM for a critical exceedance?', 'scc_mgmt', ARRAY['1.09', '1.10'], 'not_started', false, 'After-hours emergency contact chain'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.20', 1, '1A', 'Create complete organizational chart with all environmental roles', 'both', ARRAY['1.05–1.12'], 'not_started', false, 'Required for EMS Section 3'),

  -- ==========================================================================
  -- Phase 1, Section 1B: Critical Documents
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.21', 1, '1B', 'Get hard copy AND digital copy of the full Consent Decree (Case 7:16-cv-00462-GEC)', 'tom', NULL, 'not_started', false, 'Already have public version — confirm it''s current/amended'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.22', 1, '1B', 'Get the Sampling Matrix (master document mapping every outfall to parameters, frequencies, limits)', 'tom', NULL, 'not_started', false, 'THE most critical document. Cannot populate system without it.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.23', 1, '1B', 'Get the most recent quarterly EPA report (Q4 2025 or latest) with Attachments A-G', 'tom', NULL, 'not_started', false, 'Defines exact output format system must reproduce'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.24', 1, '1B', 'Get sample raw lab data files (EDD format) from each state — at least 1 per state', 'tom', NULL, 'not_started', false, 'Already have 10 files across 4 states. Need AL files.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.25', 1, '1B', 'Get ALL active NPDES permits for ALL facilities across all 5 states', 'tom', ARRAY['1.03'], 'not_started', false, 'We analyzed 5 sample permits. Hundreds remain.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.26', 1, '1B', 'Get all permit modifications/amendments issued since original permits', 'tom', ARRAY['1.25'], 'not_started', false, 'Modifications override original limits'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.27', 1, '1B', 'Get all monitoring releases (documents that remove outfalls from monitoring)', 'tom', ARRAY['1.25'], 'not_started', false, 'Changes which outfalls need active sampling'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.28', 1, '1B', 'Get any WET test suspension letters', 'tom', ARRAY['1.25'], 'not_started', false, 'Some outfalls may be exempt from toxicity testing'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.29', 1, '1B', 'Get sample DMR submission (completed DMR as submitted to a state portal)', 'tom', NULL, 'not_started', false, 'One example from each state to verify our calculations match'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.30', 1, '1B', 'Get any NOVs (Notices of Violation) from any state — last 2 years', 'tom', NULL, 'not_started', false, 'Needed to design enforcement document parser'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.31', 1, '1B', 'Get any audit reports (internal or third-party) from last 2 years', 'tom', NULL, 'not_started', false, 'Shows current compliance gap areas'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.32', 1, '1B', 'Get any existing EMS documentation (if SCC already started one)', 'tom', NULL, 'not_started', false, 'Don''t want to duplicate existing work'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.33', 1, '1B', 'Get current stipulated penalty payment records (amounts paid to date)', 'tom', NULL, 'not_started', false, 'Establishes baseline for tracking improvement'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.34', 1, '1B', 'Get state agency portal login credentials or at minimum the portal URLs for each state', 'tom', NULL, 'not_started', false, 'E2DMR, NetDMR, MyTDEC, eDMR — need to know the submission interface'),

  -- ==========================================================================
  -- Phase 1, Section 1C: Authorization & Credentials
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.35', 1, '1C', 'For each state: confirm whether a ''duly authorized representative'' letter must be on file with the agency, and if so, locate it and store it', 'scc_mgmt', ARRAY['1.17'], 'not_started', false, 'Some states require formal authorization letter before someone can sign DMRs'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.36', 1, '1C', 'For each state portal (E2DMR/NetDMR/MyTDEC/eDMR): who is the primary credential holder, who is backup, and what is the account recovery process?', 'tom', ARRAY['1.34'], 'not_started', false, 'If the primary person leaves, you need recovery on day one'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.37', 1, '1C', 'If the DMR signer leaves the company: what is the replacement timeline and process (including reauthorization paperwork)?', 'scc_mgmt', ARRAY['1.17', '1.35'], 'not_started', false, 'Define this BEFORE it happens'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.38', 1, '1C', 'Define the ''DMR close checklist'': what must be true before submission (missing labs? below-detection rules applied? no-discharge flags? QA review done?)', 'both', ARRAY['1.17'], 'not_started', false, 'Becomes a pre-submission validation in the software'),

  -- ==========================================================================
  -- Phase 1, Section 1D: Notification Procedures
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.39', 1, '1D', 'For each state: what exact phone number(s) qualify for the 24-hour notification (enforcement vs spill line vs permit writer)?', 'tom', ARRAY['2.30–2.49'], 'not_started', false, 'Different lines for different types of notifications'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.40', 1, '1D', 'Create a call log requirement: who logs it, where, what fields are recorded (date/time, agency person spoken to, summary, ticket/reference number)', 'both', ARRAY['1.15'], 'not_started', false, 'This becomes a feature in the software — notification log'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.41', 1, '1D', 'Define the after-hours on-call rotation: named primary + backup per facility per state', 'scc_mgmt', ARRAY['1.15', '1.19'], 'not_started', false, 'What happens at 2 AM on a Saturday?'),

  -- ==========================================================================
  -- Phase 1, Section 1E: Governance & Policies (v3 new)
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.42', 1, '1E', 'Define records retention policy (by record type): permits, lab EDDs, COCs, calibration records, DMRs, call logs, training rosters, quarterly reports, EPA correspondence. Specify retention period and storage location for each.', 'both', NULL, 'not_started', true, 'Default to 10 years minimum for all compliance records.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.43', 1, '1E', 'Define correction policy for compliance data: when someone fixes a lab import, limit, or DMR value, who can initiate, what approval flow is required, and what evidence/justification must be recorded.', 'scc_mgmt', NULL, 'not_started', true, 'Becomes the business rule behind software task 3.31.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.44', 1, '1E', 'Define offboarding and access revocation checklist (same-day): revoke portal credentials, revoke app access, rotate shared credentials, reassign open tasks and ownership.', 'scc_mgmt', ARRAY['1.09–1.12'], 'not_started', true, 'Access must be revoked before end of business day. No grace period.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '1.45', 1, '1E', 'Define two-person rule for high-risk actions: changing a permit limit, marking an exceedance as resolved, finalizing a DMR, submitting a quarterly report. One person initiates, a different person approves.', 'scc_mgmt', ARRAY['1.17', '1.18'], 'not_started', true, 'Prevents single-point-of-failure decisions. Maps to 3.31.'),

  -- ==========================================================================
  -- Phase 2, Section 2A: Permit Inventory
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.01', 2, '2A', 'Complete permit inventory: list every NPDES permit number, facility, state, effective date, expiration date, status (active/expired/continued)', 'both', ARRAY['1.25'], 'not_started', false, 'Master spreadsheet of all permits'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.02', 2, '2A', 'For each permit: is it individual or general (with coverage letter)?', 'both', ARRAY['2.01'], 'not_started', false, 'KY uses general permits; other states use individual'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.03', 2, '2A', 'For each permit: list every authorized outfall number', 'both', ARRAY['1.25'], 'not_started', false, 'Must match exactly what''s in the permit'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.04', 2, '2A', 'For each outfall: is it active (discharging), inactive, or closed?', 'tom', ARRAY['2.03'], 'not_started', false, 'Determines monitoring requirements'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.05', 2, '2A', 'For each outfall: list every parameter monitored with limit type (daily max, monthly avg, daily min, report only) and limit value', 'both', ARRAY['1.22', '1.25'], 'not_started', false, 'Core permit_limits data'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.06', 2, '2A', 'For each outfall+parameter: sampling frequency (2/month, quarterly, etc.) and sample type (grab, composite)', 'both', ARRAY['1.22'], 'not_started', false, 'Drives sampling calendar generation'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.07', 2, '2A', 'Identify all conditional exemptions: AL Mn/pH rule, precipitation alternate limits, any others', 'both', ARRAY['1.25'], 'not_started', false, 'Must be configured before compliance checks work'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.08', 2, '2A', 'Identify all permits in administrative continuation (expired but still in effect)', 'both', ARRAY['2.01'], 'not_started', false, 'Flag for renewal tracking'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.09', 2, '2A', 'Verify the Sampling Matrix matches every permit. Any discrepancies?', 'scc_mgmt', ARRAY['1.22', '2.05'], 'not_started', false, 'Sampling Matrix should be the source of truth'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.10', 2, '2A', 'Upload all permits into the compliance system via Upload Dashboard', 'you', ARRAY['2.01', '3.03'], 'not_started', false, 'AI extraction + human verification'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.11', 2, '2A', 'Environmental Manager verifies every AI-extracted limit against actual permit', 'scc_mgmt', ARRAY['2.10'], 'not_started', false, 'CRITICAL — wrong limits = wrong compliance checks'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.12', 2, '2A', 'Identify any permits pending renewal or modification', 'tom', ARRAY['2.01'], 'not_started', false, 'Track for deadline management'),

  -- ==========================================================================
  -- Phase 2, Section 2B: Permit Lifecycle
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.13', 2, '2B', 'For every permit: what is the renewal application deadline (often months before expiration), not just expiration date', 'both', ARRAY['2.01'], 'not_started', false, 'Missing a renewal deadline is itself a violation'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.14', 2, '2B', 'For every permit: define the ''permit change intake'' process (how you detect mods/letters quickly)', 'both', ARRAY['2.01'], 'not_started', false, 'Who checks mail, who watches for electronic notices?'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.15', 2, '2B', 'For every amendment/mod: confirm how you mark prior limits as superseded', 'you', ARRAY['2.01'], 'not_started', false, 'Software must handle chronological limit application'),

  -- ==========================================================================
  -- Phase 2, Section 2C: Laboratory Management
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.16', 2, '2C', 'List every certified lab used across all 5 states', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.17', 2, '2C', 'For each lab: contact person name, phone, email', 'tom', ARRAY['2.16'], 'not_started', false, 'Needed when issues arise with EDD deliverables'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.18', 2, '2C', 'For each lab: state certifications held (each state requires separate lab cert)', 'tom', ARRAY['2.16'], 'not_started', false, 'Lab must be certified in the state where sample was collected'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.19', 2, '2C', 'For each lab: certification expiration dates', 'tom', ARRAY['2.18'], 'not_started', false, 'Track for renewal alerts'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.20', 2, '2C', 'For each lab: EDD delivery format (confirm 26-column standard)', 'tom', ARRAY['2.16'], 'not_started', false, '10/10 files match so far but confirm all labs use same'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.21', 2, '2C', 'For each lab: turnaround time commitment (days from receipt to EDD delivery)', 'tom', ARRAY['2.16'], 'not_started', false, 'Impacts when data is available for DMR calculation'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.22', 2, '2C', 'For each lab: reporting limits (QL, MDL) for each parameter they analyze', 'tom', ARRAY['2.16'], 'not_started', false, 'Needed for below-detection DMR calculations'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.23', 2, '2C', 'Confirm which lab(s) perform WET testing and their schedule', 'tom', ARRAY['2.16'], 'not_started', false, 'Quarterly toxicity testing'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.24', 2, '2C', 'Confirm which lab/specialist performs fish tissue sampling (KY selenium)', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.25', 2, '2C', 'Confirm which specialist performs stream biological monitoring (VA VASCI)', 'tom', NULL, 'not_started', false, 'Annual requirement — results due March 1'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.26', 2, '2C', 'For each lab: sample pickup/dropoff windows, weekend/holiday constraints, cutoff times', 'tom', ARRAY['2.16'], 'not_started', false, 'Most compliance fires come from logistics delays'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.27', 2, '2C', 'For each lab: escalation path (if EDD is late/incorrect), and expected response SLA', 'tom', ARRAY['2.17'], 'not_started', false, 'Who do you call when the EDD is wrong?'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.28', 2, '2C', 'For each parameter group: confirm bottle types/preservatives/hold times and who maintains inventory', 'tom', ARRAY['2.16'], 'not_started', false, 'Field samplers need supplies on hand'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.29', 2, '2C', 'For each lab: test method codes used (so units/MDL/QL handling is consistent)', 'tom', ARRAY['2.16'], 'not_started', false, 'Method determines detection limits and units'),

  -- ==========================================================================
  -- Phase 2, Section 2D: State Agency & Federal Contacts
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.30', 2, '2D', 'Alabama (ADEM): permit writer name, phone, email', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.31', 2, '2D', 'Alabama (ADEM): enforcement contact name, phone, email', 'tom', NULL, 'not_started', false, 'Person you call for 24-hour notifications'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.32', 2, '2D', 'Alabama (ADEM): DMR support contact', 'tom', NULL, 'not_started', false, 'E2DMR portal issues'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.33', 2, '2D', 'Alabama (ADEM): after-hours emergency number', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.34', 2, '2D', 'Kentucky (KYDEP): permit writer name, phone, email', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.35', 2, '2D', 'Kentucky (KYDEP): enforcement contact name, phone, email', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.36', 2, '2D', 'Kentucky (KYDEP): DMR support contact', 'tom', NULL, 'not_started', false, 'NetDMR portal issues'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.37', 2, '2D', 'Kentucky (KYDEP): after-hours emergency number', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.38', 2, '2D', 'Tennessee (TDEC): permit writer name, phone, email', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.39', 2, '2D', 'Tennessee (TDEC): enforcement contact name, phone, email', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.40', 2, '2D', 'Tennessee (TDEC): DMR support contact', 'tom', NULL, 'not_started', false, 'MyTDEC portal issues'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.41', 2, '2D', 'Tennessee (TDEC): after-hours emergency number', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.42', 2, '2D', 'Virginia (DEQ): permit writer name, phone, email', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.43', 2, '2D', 'Virginia (DEQ): enforcement contact name, phone, email', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.44', 2, '2D', 'Virginia (DEQ): DMR support contact', 'tom', NULL, 'not_started', false, 'eDMR portal issues'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.45', 2, '2D', 'Virginia (DEQ): after-hours emergency number', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.46', 2, '2D', 'West Virginia (DEP): permit writer name, phone, email', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.47', 2, '2D', 'West Virginia (DEP): enforcement contact name, phone, email', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.48', 2, '2D', 'West Virginia (DEP): DMR support contact', 'tom', NULL, 'not_started', false, 'NetDMR portal issues'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.49', 2, '2D', 'West Virginia (DEP): after-hours emergency number', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.50', 2, '2D', 'EPA regional contact for Consent Decree oversight', 'tom', NULL, 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.51', 2, '2D', 'DOJ attorney assigned to the Consent Decree case', 'legal', NULL, 'not_started', false, NULL),

  -- ==========================================================================
  -- Phase 2, Section 2E: Field Operations & QA/QC
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.52', 2, '2E', 'Inventory every field instrument (pH, conductivity, flow meters): serial #, location, calibration SOP, calibration interval', 'scc_mgmt', ARRAY['1.11'], 'not_started', false, 'Can''t defend data from uncalibrated instruments'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.53', 2, '2E', 'Define where calibration records live and how long they''re retained', 'both', ARRAY['2.52'], 'not_started', false, 'Must be retrievable for audits and legal proceedings'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.54', 2, '2E', 'Standardize Chain of Custody (COC) forms and require uploads/scans tied to each sampling event', 'both', NULL, 'not_started', false, 'Even if just PDFs initially — link to sampling_events'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.55', 2, '2E', 'Define ''no discharge'' documentation standard: who records it, acceptable evidence, and approval', 'both', NULL, 'not_started', false, 'No-discharge claims on DMRs must be defensible'),

  -- ==========================================================================
  -- Phase 2, Section 2F: Storm Event Management
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.56', 2, '2F', 'Identify the official weather station(s) and data source used for storm qualification per site/state', 'both', ARRAY['1.25'], 'not_started', false, 'Must be a recognized, defensible data source'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.57', 2, '2F', 'Define the storm event evidence packet: rainfall data, recurrence calc, photos/notes, exemption claim, 48-hour sampling proof', 'both', ARRAY['2.56'], 'not_started', false, 'Becomes a template in the software'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.58', 2, '2F', 'Who is authorized to claim the exemption, and who reviews/approves the claim?', 'scc_mgmt', ARRAY['1.10'], 'not_started', false, 'Not everyone should be able to claim an exemption'),

  -- ==========================================================================
  -- Phase 2, Section 2G: Submission & Data Integrity (v3 new)
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.59', 2, '2G', 'Standardize proof-of-submission evidence types: for DMRs, 5-day letters, quarterly reports, define what counts as proof (portal receipt PDF, screenshot, confirmation email, certified mail receipt) and required metadata.', 'both', ARRAY['1.17', '1.38'], 'not_started', true, 'Without proof-of-submission, you cannot prove you met a deadline.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.60', 2, '2G', 'Build a state-specific DMR rules checklist per state: rounding rules, significant digits, below-detection handling (half-MDL vs zero vs MDL), NODI code expectations, composite vs grab constraints.', 'both', ARRAY['1.25', '1.29'], 'not_started', true, 'Each state has different rules. Silent errors from wrong rounding are common audit findings.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '2.61', 2, '2G', 'Define unit normalization rules and conversion table: mg/L vs ug/L, cfs vs gpm, S.U. vs pH units. Document how each lab reports and how the system normalizes.', 'both', ARRAY['2.16', '2.29'], 'not_started', true, 'Unit mismatch = instant false positive or missed exceedance.'),

  -- ==========================================================================
  -- Phase 3, Section 3A: Core Software Build
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.01', 3, '3A', 'Build Upload Dashboard UI (React + TypeScript per handoff spec v5+v6)', 'you', NULL, 'not_started', false, 'Critical path — everything else depends on this'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.02', 3, '3A', 'Apply minimum RLS policies for Upload Dashboard tables', 'you', ARRAY['3.01'], 'not_started', false, 'Per v6 delta spec section 2'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.03', 3, '3A', 'Test: upload a file, see it in queue, Realtime fires', 'you', ARRAY['3.01', '3.02'], 'not_started', false, 'Smoke test per v6 section 12'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.04', 3, '3A', 'Upload all NPDES permits through Upload Dashboard', 'both', ARRAY['3.03', '1.25'], 'not_started', false, 'AI extraction + human verification workflow'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.05', 3, '3A', 'Environmental Manager verifies all extracted permit limits', 'scc_mgmt', ARRAY['3.04'], 'not_started', false, 'Every limit must be human-verified before compliance checks'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.06', 3, '3A', 'Build lab data import parser (parse-lab-data-edd Edge Function)', 'you', ARRAY['1.24'], 'not_started', false, '26-column EDD format — spec complete'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.07', 3, '3A', 'Build NetDMR CSV parser (parse-dmr-netdmr-csv Edge Function)', 'you', ARRAY['1.29'], 'not_started', false, 'For importing historical DMR submissions'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.08', 3, '3A', 'Build OSMRE Monitoring Report parser', 'you', ARRAY['1.29'], 'not_started', false, 'TN quarterly monitoring format'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.09', 3, '3A', 'Verify STORET codes in parameters table match all codes in real data', 'you', ARRAY['1.24', '1.29'], 'not_started', false, 'May need to add dissolved fractions, temperature, etc.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.10', 3, '3A', 'Import historical lab data (backfill last 12+ months if available)', 'both', ARRAY['3.05', '3.06'], 'not_started', false, 'Establishes baseline and proves system accuracy'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.11', 3, '3A', 'Compare system DMR calculations against actual submitted DMRs', 'both', ARRAY['3.10', '1.29'], 'not_started', false, 'System''s numbers must match what was filed. Any mismatch = bug or wrong limit.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.12', 3, '3A', 'Build compliance dashboard (real-time status across all facilities)', 'you', ARRAY['3.05', '3.10'], 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.13', 3, '3A', 'Build exceedance alerting (email via Resend, SMS via Twilio)', 'you', ARRAY['3.05', '3.10', '1.15'], 'not_started', false, 'Alerts to the named 24-hour notification person'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.14', 3, '3A', 'Build sampling calendar generator (from permit schedules)', 'you', ARRAY['3.05'], 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.15', 3, '3A', 'Build DMR calculation engine (monthly avg, daily max/min, sample counts, NODI, below-detection per state)', 'you', ARRAY['3.05', '3.10'], 'not_started', false, 'State-specific below-detection rules critical'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.16', 3, '3A', 'Build DMR review/approve/submit workflow', 'you', ARRAY['3.15'], 'not_started', false, 'Draft -> review -> approve -> submit (manual to portal)'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.17', 3, '3A', 'Build stipulated penalty calculator', 'you', ARRAY['3.05', '3.10'], 'not_started', false, 'Violation x daily rate x days'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.18', 3, '3A', 'Build quarterly report generator (Attachments A-G)', 'you', ARRAY['3.15', '3.17', '1.23'], 'not_started', false, 'Must match exact format of actual quarterly report'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.19', 3, '3A', 'Build corrective action tracking module', 'you', ARRAY['3.05'], 'not_started', false, 'Linked to exceedances, assigned to personnel, tracked to closure'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.20', 3, '3A', 'Build this Implementation Roadmap module into the app', 'you', ARRAY['3.01'], 'not_started', false, 'So all 178 tasks are tracked in the system itself'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.21', 3, '3A', 'Build Consent Decree obligation tracker: per-obligation status, evidence attachments, proof-of-submission records', 'you', ARRAY['3.01'], 'not_started', false, '75 obligations need individual tracking with evidence'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.22', 3, '3A', 'Build 24-hour notification log: call log with timestamp, agency person, summary, reference number', 'you', ARRAY['3.13', '1.40'], 'not_started', false, 'Prove the call happened'),

  -- ==========================================================================
  -- Phase 3, Section 3B: Infrastructure & QA
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.23', 3, '3B', 'Environments: establish dev/stage/prod separation (even if lightweight)', 'you', NULL, 'not_started', false, 'Never test against production compliance data'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.24', 3, '3B', 'Backup/restore test: prove you can restore Supabase data + storage objects', 'you', ARRAY['3.01'], 'not_started', false, 'Run a full restore test before go-live'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.25', 3, '3B', 'Monitoring/alerting for failed parsers/imports (so silent failures don''t linger)', 'you', ARRAY['3.06', '3.07'], 'not_started', false, 'A parser that fails silently is worse than no parser'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.26', 3, '3B', 'Audit trail verification test: confirm critical actions are captured and exportable', 'you', ARRAY['3.01'], 'not_started', false, 'Export audit trail, verify it contains what''s expected'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.27', 3, '3B', 'Report export disclaimers + footer disclaimer implemented in-app', 'you', ARRAY['3.01'], 'not_started', false, 'Software Disclaimer document is finalized — implement it'),

  -- ==========================================================================
  -- Phase 3, Section 3C: Governance Features (v3 new)
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.28', 3, '3C', 'Build evidence capture for manual portal submissions: after someone submits a DMR/notification/quarterly report to a state portal, require upload of receipt (screenshot/PDF) before the submission can be marked complete.', 'you', ARRAY['3.16', '3.18'], 'not_started', true, 'No ''complete'' without attached proof.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.29', 3, '3C', 'Build change log UI (human-readable): who changed what, before/after values, timestamp, reason/justification, linked evidence. Must be exportable for audit.', 'you', ARRAY['3.01'], 'not_started', true, 'This is how you survive audits. audit_log table has the data; this is the UI.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.30', 3, '3C', 'Build access control hardening: RBAC/RLS enforcement verification, MFA expectations, user lifecycle (invite -> role assignment -> removal), periodic access review trigger.', 'you', ARRAY['3.01'], 'not_started', true, 'Implements policy from 1.44. Quarterly access review per 5.13.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '3.31', 3, '3C', 'Build data correction workflow: draft -> review -> approve. Captures original value, proposed value, justification, reviewer approval, timestamp.', 'you', ARRAY['3.01'], 'not_started', true, 'Software implementation of 1.43 and 1.45. Two-person rule enforced in code.'),

  -- ==========================================================================
  -- Phase 4, Section 4A: EMS Document Completion
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.01', 4, '4A', 'Complete EMS Section 1: fill in facility counts per state, confirm subsidiary list, confirm active states', 'scc_mgmt', ARRAY['1.02', '1.03'], 'not_started', false, 'Template created — fill in [brackets]'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.02', 4, '4A', 'Complete EMS Section 2: Executive signs Environmental Policy Statement', 'scc_mgmt', ARRAY['1.05'], 'not_started', false, 'Cannot be delegated — highest-ranking officer must sign'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.03', 4, '4A', 'Complete EMS Section 3: fill in ALL named individuals for corporate and site roles', 'scc_mgmt', ARRAY['1.05–1.20'], 'not_started', false, 'Use org chart from Phase 1'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.04', 4, '4A', 'Complete EMS Section 4: write field sampling SOPs specific to SCC operations', 'scc_mgmt', NULL, 'not_started', false, 'Container types, preservation, hold times, calibration, COC forms'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.05', 4, '4A', 'Complete EMS Section 5: define escalation procedures, 24-hour notification talking points, 5-day written templates per state', 'scc_mgmt', ARRAY['1.15', '1.39–1.41'], 'not_started', false, 'Each state may have different notification formats'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.06', 4, '4A', 'Complete EMS Section 7: verify penalty rates match exact Consent Decree paragraph numbers', 'legal', ARRAY['1.21'], 'not_started', false, 'Legal counsel must confirm rates from actual decree'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.07', 4, '4A', 'Complete EMS Section 9: develop training materials for each topic', 'scc_mgmt', NULL, 'not_started', false, 'EMS overview, CD obligations, field sampling, system operation, exceedance response, DMR prep, emergency'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.08', 4, '4A', 'Complete EMS Appendix A: fill in all state agency contacts', 'tom', ARRAY['2.30–2.51'], 'not_started', false, 'Verify quarterly — agency personnel change'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.09', 4, '4A', 'Complete EMS Appendix B: full facility inventory with permit numbers and outfall counts', 'both', ARRAY['2.01'], 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.10', 4, '4A', 'Complete EMS Appendix C: finalize master compliance calendar with all deadlines', 'both', ARRAY['All Phase 2'], 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.11', 4, '4A', 'Complete all ACTION REQUIRED checklists in EMS template', 'scc_mgmt', ARRAY['4.01–4.10'], 'not_started', false, 'Go through every orange box in the template'),

  -- ==========================================================================
  -- Phase 4, Section 4B: Management Systems
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.12', 4, '4B', 'Define management review cadence + agenda template + where minutes are stored', 'scc_mgmt', NULL, 'not_started', false, 'Quarterly minimum per CD'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.13', 4, '4B', 'Establish training tracking system: where training rosters live, who updates, how re-training is triggered', 'scc_mgmt', NULL, 'not_started', false, 'Can be in compliance software or separate HR system'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.14', 4, '4B', 'Create emergency response plan per facility + drill schedule + drill evidence requirements', 'scc_mgmt', NULL, 'not_started', false, 'Facility-specific, not generic'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.15', 4, '4B', 'Define document control procedure: versioning, approvals, distribution, and ''old version retired'' rules', 'both', NULL, 'not_started', false, 'How do SOPs get updated? Who approves? How are old versions archived?'),

  -- ==========================================================================
  -- Phase 4, Section 4C: Consent Decree Obligation Mapping
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.16', 4, '4C', 'For each of the 75 CD obligations: what is the required evidence artifact to prove completion?', 'both', ARRAY['1.21'], 'not_started', false, 'Document, report, log, screenshot, letter, training roster, invoice, etc.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.17', 4, '4C', 'For each obligation: who is the named owner and who is the reviewer/approver?', 'scc_mgmt', ARRAY['4.16'], 'not_started', false, 'Person-level accountability'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.18', 4, '4C', 'For each obligation: is it one-time / recurring / conditional / ongoing, and what is the ''done definition''?', 'both', ARRAY['4.16'], 'not_started', false, 'What exactly counts as compliant?'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.19', 4, '4C', 'For each recurring obligation: what is the recurrence rule and grace period (if any)?', 'legal', ARRAY['4.18'], 'not_started', false, 'Legal must interpret the decree for recurring items'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.20', 4, '4C', 'For each conditional obligation: what are the trigger conditions and how will you detect/record the trigger?', 'both', ARRAY['4.18'], 'not_started', false, 'Selenium thresholds, etc.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.21', 4, '4C', 'For each obligation: what is the submission pathway (email, portal, mail) and what proof-of-submission must be retained?', 'scc_mgmt', ARRAY['4.16'], 'not_started', false, 'Confirmation emails, certified mail receipts, portal screenshots'),

  -- ==========================================================================
  -- Phase 4, Section 4D: EMS Review & Submission
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.22', 4, '4D', 'Corporate legal counsel reviews complete EMS document', 'legal', ARRAY['4.11'], 'not_started', false, 'Must verify CD obligation interpretation'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.23', 4, '4D', 'Executive leadership reviews and approves EMS', 'scc_mgmt', ARRAY['4.22'], 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.24', 4, '4D', 'Submit EMS draft to EPA per Consent Decree requirements', 'scc_mgmt', ARRAY['4.23'], 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.25', 4, '4D', 'Incorporate EPA feedback and resubmit if required', 'scc_mgmt', ARRAY['4.24'], 'not_started', false, 'May require multiple rounds'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.26', 4, '4D', 'Upon EPA approval: distribute to all facilities', 'scc_mgmt', ARRAY['4.25'], 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.27', 4, '4D', 'Schedule and conduct initial EMS training for all personnel', 'scc_mgmt', ARRAY['4.26', '4.07'], 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.28', 4, '4D', 'Set annual EMS review date in compliance calendar', 'scc_mgmt', ARRAY['4.26'], 'not_started', false, NULL),

  -- ==========================================================================
  -- Phase 4, Section 4E: Submission Packet & Version Control (v3 new)
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.29', 4, '4E', 'Assemble EMS submission packet: final EMS + all appendices + org chart + proof of management approval (signed page) + authorization letters. Single package, version-stamped.', 'scc_mgmt', ARRAY['4.23'], 'not_started', true, 'EPA expects a complete packet, not piecemeal.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '4.30', 4, '4E', 'Maintain EMS version history and distribution log: who received the approved EMS, when, delivery method, acknowledgment of receipt.', 'both', ARRAY['4.26'], 'not_started', true, 'When EPA asks ''did Site X have the current EMS?'' you need proof.'),

  -- ==========================================================================
  -- Phase 5, Section 5A: Go-Live & Validation
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '5.01', 5, '5A', 'Conduct first real-time compliance check: import current month''s lab data, verify exceedance detection', 'both', ARRAY['Phase 3'], 'not_started', false, 'Side-by-side with manual process to validate'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '5.02', 5, '5A', 'Produce first system-generated DMR, compare against manually-prepared DMR', 'both', ARRAY['5.01'], 'not_started', false, 'Numbers must match exactly'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '5.03', 5, '5A', 'Submit first DMR to state portal using system-calculated values', 'scc_mgmt', ARRAY['5.02'], 'not_started', false, 'Human still enters into portal manually'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '5.04', 5, '5A', 'Produce first system-generated quarterly report data package', 'both', ARRAY['5.01'], 'not_started', false, 'Compare against manually-prepared quarterly report'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '5.05', 5, '5A', 'Conduct management review meeting using compliance dashboard data', 'scc_mgmt', ARRAY['3.12'], 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '5.06', 5, '5A', 'Test exceedance alert chain: trigger alert -> confirm right person receives -> confirm they know what to do', 'both', ARRAY['3.13', '1.15'], 'not_started', false, 'Tabletop exercise'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '5.07', 5, '5A', 'Run first internal compliance data audit (system vs. manual calculations)', 'both', ARRAY['5.01'], 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '5.08', 5, '5A', 'Present system to SCC leadership with live data', 'you', ARRAY['5.01–5.07'], 'not_started', false, 'Demo, not a pitch deck. Show real exceedances, real penalties, real DMRs.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '5.09', 5, '5A', 'Transition from parallel operation (manual + system) to system-primary', 'both', ARRAY['5.07'], 'not_started', false, 'Only after multiple months of matching results'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '5.10', 5, '5A', 'Conduct first quarterly EMS audit using compliance system data', 'scc_mgmt', ARRAY['4.26', '5.09'], 'not_started', false, NULL),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '5.11', 5, '5A', 'Begin tracking system ROI: time saved per DMR, exceedances caught faster, penalties avoided', 'you', ARRAY['5.09'], 'not_started', false, 'Needed for commercial expansion pitch'),

  -- ==========================================================================
  -- Phase 5, Section 5B: Audit Readiness & Ongoing Governance (v3 new)
  -- ==========================================================================
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '5.12', 5, '5B', 'Run a mock regulator audit using the system: pick one exceedance, produce the full defensibility bundle — lab result, COC, calibration record, 24-hour call log, 5-day letter, corrective action, DMR impact, proof-of-submission.', 'both', ARRAY['Phase 3', 'Phase 4'], 'not_started', true, 'If you can produce this in under 30 minutes, the system is court-ready.'),
  ('2bffc35c-e2c4-4396-868f-207f80e1e2c4', '5.13', 5, '5B', 'Establish quarterly access review and contact verification cadence: verify all system users still need their access level, verify all agency contacts are current, document the review.', 'scc_mgmt', ARRAY['3.30', '2.30–2.51'], 'not_started', true, 'Agency contacts change. Personnel change. Recurring calendar task.');

COMMIT;

-- ============================================================================
-- Verification (uncomment to run after migration)
-- ============================================================================
-- SELECT
--   phase,
--   section,
--   COUNT(*) AS task_count,
--   COUNT(*) FILTER (WHERE is_new_v3) AS new_v3_count
-- FROM roadmap_tasks
-- WHERE organization_id = '2bffc35c-e2c4-4396-868f-207f80e1e2c4'
-- GROUP BY phase, section
-- ORDER BY phase, section;
--
-- -- Expected total: 180 tasks (Phase 1: 45, Phase 2: 61, Phase 3: 31, Phase 4: 30, Phase 5: 13)
-- -- Expected new_v3: 14 tasks (1.42-1.45, 2.59-2.61, 3.28-3.31, 4.29-4.30, 5.12-5.13)
-- SELECT COUNT(*) AS total_tasks FROM roadmap_tasks
-- WHERE organization_id = '2bffc35c-e2c4-4396-868f-207f80e1e2c4';
