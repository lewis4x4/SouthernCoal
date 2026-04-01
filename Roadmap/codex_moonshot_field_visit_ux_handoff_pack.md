# Codex Moonshot Field Visit UX Handoff Pack

## Purpose

This handoff pack is the implementation package for turning the current Field Visit experience into a world-class, moonshot-grade field operations workflow for the WV sampling program.

This package is designed so you can hand it directly to Codex.

It includes:
- product intent
- execution order
- phase roadmap
- required outputs
- system prompt
- kickoff prompt
- implementation spec
- acceptance criteria
- file list to create or modify
- definition of done

---

# 1. Product standard

This is not a generic environmental form app.

The target is a field operating system that:
- minimizes typing
- maximizes guided execution
- reduces mistakes through automation and scanning
- captures defensible evidence by default
- feels elite, deliberate, and industrial-grade
- would make large regulated operators and Fortune 500 field organizations jealous

Every UX and workflow decision should be evaluated against this bar:

**Does this make the product feel more like a category-defining industrial field OS and less like a compliance form?**

If not, do not ship it.

---

# 2. The problem with the current screen

The current Field Visit page works, but it still behaves like a long, static form.

That is not good enough.

The major current weaknesses are:
- too much visual density
- too much manual entry
- too many blank fields with no guidance
- outcome-specific requirements are not prominent enough
- photos are too generic
- container entry is manual instead of scan-first
- weather is blank instead of assisted
- required field measurements are not clearly separated from lab results
- the page does not feel like a guided field workflow

The next evolution is to transform it into a guided operational sequence.

---

# 3. Required product decisions

## 3.1 Field measurements vs lab results

The field app must only collect **true field measurements** taken on site.

Examples:
- pH
- temperature
- dissolved oxygen
- conductivity
- any other meter-based field observation

The field app must **not** ask samplers to enter later lab results.

Lab results must arrive through the lab ingestion pipeline and link back to the sampling event afterward.

### Product rule
- Field visit page shows only field measurements required for that outfall on that stop.
- Those required measurements must be prefilled from permit/outfall requirements.
- Lab parameters/results are handled downstream by lab import and compliance workflows.

## 3.2 Barcode-first container workflow

Primary container entry must be scan-first.

Typing container IDs should be fallback only.

Scan should support:
- container ID
- serial / label ID
- bottle type if encoded
- preservative or kit mapping if encoded

The system should warn if the scanned bottle/kit does not match the scheduled sample requirements for that stop.

## 3.3 Weather handling

When the sampler starts a visit, the system should:
- capture timestamp
- capture GPS
- call a weather API using the visit location and time
- prefill system weather conditions
- allow user override / supplement with observed site conditions

The model should distinguish:
- system weather
- observed site conditions

---

# 4. Moonshot UX roadmap by phase

## Phase 1 — Guided outcome-first field workflow

### Goal
Transform the current Field Visit page from a static form into a guided workflow.

### Scope
- Step-based flow:
  1. Start visit
  2. Confirm location
  3. Inspection
  4. Choose outcome
  5. Outcome-specific data entry
  6. Review and complete
- Dynamic layout based on selected outcome
- Clear required-before-complete indicators
- Stronger compliance-oriented copy

### Must build
- stepper/progress component
- outcome-specific rendering rules
- review/complete summary panel
- live missing-items checklist

### Why first
This is the highest UX leverage change. It reduces confusion immediately without waiting on deeper platform features.

### Acceptance criteria
- Sample collected, no discharge, and access issue each show materially different UI flows
- User can understand what is required without scrolling the whole page
- Completion blockers are visible before submit

---

## Phase 2 — Smart prefills and outfall intelligence

### Goal
Reduce typing and make each stop feel context-aware.

### Scope
- Prefill required field measurements from outfall/permit rules
- Show a “What is required at this stop” card
- Prefill recurring inspection defaults from prior visit context
- Show prior visit context

### Must build
- outfall requirements summary card
- field measurements auto-generated from route/stop requirements
- last-visit context panel:
  - last visit date
  - last outcome
  - last access issue
  - last no-discharge note
  - prior thumbnails if available
- one-tap “unchanged from last visit” helpers where appropriate

### Acceptance criteria
- Field measurements section only shows required on-site measurements for that stop
- Sampler is not asked to enter lab values
- Prior context is visible without leaving the page

---

## Phase 3 — Scan-first collection and custody

### Goal
Replace manual bottle/container typing with scan-driven workflow.

### Scope
- barcode/QR scanning through camera
- container auto-fill
- bottle-kit validation
- custody-first UX for sample_collected outcome

### Must build
- scan container button
- device camera scan flow
- fallback manual entry
- mismatch warnings for wrong bottle/kit
- sample-collected workflow that pushes directly into custody completion

### Acceptance criteria
- Scanner can populate container ID without typing
- Wrong kit/bottle creates visible warning and prevents blind completion
- Sample-collected flow feels faster than manual entry

---

## Phase 4 — Weather, environment, and site reality automation

### Goal
Make the system operationally aware of field conditions.

### Scope
- weather API at start visit
- observed site conditions override
- one-tap site condition templates
- hold-time urgency indicators

### Must build
- system weather pull on start visit
- observed condition input
- weather + site conditions card
- urgency flagging for short-hold stops

### Acceptance criteria
- Weather auto-populates when visit begins
- User can correct or supplement conditions
- Short-hold stops visibly communicate urgency

---

## Phase 5 — Elite field efficiency layer

### Goal
Make repeat work extremely fast and consistent.

### Scope
- dropdown templates
- common narratives
- photo category buckets
- quick actions

### Must build
- controlled picklists for recurring entries
- quick phrase templates for no discharge, access, inspection, and field notes
- categorized photo slots:
  - outlet/signage
  - flow/no-flow
  - sample containers
  - obstruction/deficiency
  - site/weather
- deficiency prompt when inspection flags issues

### Acceptance criteria
- Sampler can complete common recurring stops with minimal typing
- Photo evidence is structured, not just dumped into a generic evidence bucket
- Inspection issues can immediately become deficiencies

---

## Phase 6 — Safety, QA, and operational resilience

### Goal
Round out the field visit workflow into a serious field operating system.

### Scope
- safety prompts
- unsafe-to-proceed actions
- duplicate / QA prompts
- supervisor review hooks
- offline resilience polish

### Must build
- safety / lone-worker actions
- one-tap unsafe-to-proceed / safety hold
- QA sample prompts where scheduling requires it
- sync state clarity during visit execution
- stronger retry/recovery behaviors on mobile

### Acceptance criteria
- Safety escalation is possible from within the visit flow
- QA prompts can appear for designated stops
- Offline and sync states are obvious to the field user

---

# 5. Prioritized feature list

## Tier 1 — Must do now
1. Outcome-first dynamic workflow
2. Live missing-items checklist
3. Field-measurements prefilled from outfall requirements
4. Split field measurements from lab-result logic
5. Barcode-first container workflow
6. Weather API + observed conditions override

## Tier 2 — Next highest value
7. “What is required at this stop” card
8. Last-visit context panel
9. Dropdown templates / quick phrases
10. Structured photo categories
11. Custody workflow tightened into sample-collected path
12. Hold-time urgency indicators

## Tier 3 — Serious field OS upgrades
13. Safety / unsafe-to-proceed controls
14. Deficiency creation prompts
15. QA / duplicate sample prompts
16. Advanced offline/sync clarity
17. Reusable “same as last visit” helpers

---

# 6. Files Codex should create or modify

## Existing files likely to modify
- `src/pages/FieldVisitPage.tsx`
- `src/lib/fieldVisitCompletionValidation.ts`
- `src/lib/fieldVisitValidationCopy.ts`
- `src/hooks/useFieldOps.ts`
- `src/lib/fieldOutboundQueue.ts`
- `src/hooks/useAuditLog.ts`
- any current field route or stop-detail components that feed visit context

## New files to create
- `src/components/field-visit/FieldVisitStepper.tsx`
- `src/components/field-visit/FieldVisitRequiredChecklist.tsx`
- `src/components/field-visit/FieldVisitOutcomePanel.tsx`
- `src/components/field-visit/FieldVisitRequirementsCard.tsx`
- `src/components/field-visit/FieldVisitLastContextCard.tsx`
- `src/components/field-visit/FieldVisitPhotoBuckets.tsx`
- `src/components/field-visit/FieldVisitWeatherCard.tsx`
- `src/components/field-visit/FieldVisitShortHoldAlert.tsx`
- `src/components/field-visit/FieldMeasurementInputs.tsx`
- `src/components/field-visit/CustodyScanPanel.tsx`
- `src/components/field-visit/QuickPhrasePicker.tsx`
- `src/components/field-visit/DeficiencyPrompt.tsx`
- `src/components/field-visit/SafetyActionsPanel.tsx`
- `src/lib/fieldVisitTemplates.ts`
- `src/lib/fieldVisitRequirements.ts`
- `src/lib/fieldMeasurementPrefill.ts`
- `src/lib/weatherAtVisitStart.ts`
- `src/lib/containerScan.ts`
- `src/lib/photoEvidenceBuckets.ts`
- `src/lib/fieldVisitUxFlags.ts`

## Tests to create or update
- `src/pages/__tests__/FieldVisitPage.outcome-first.test.tsx`
- `src/lib/__tests__/fieldMeasurementPrefill.test.ts`
- `src/lib/__tests__/weatherAtVisitStart.test.ts`
- `src/lib/__tests__/containerScan.test.ts`
- `src/components/field-visit/__tests__/FieldVisitRequiredChecklist.test.tsx`
- `src/components/field-visit/__tests__/FieldVisitOutcomePanel.test.tsx`

---

# 7. System prompt for Codex

```text
You are the lead product architect and principal implementation agent for the Southern Coal Corporation WV field operations platform.

You are not building a generic form.
You are building a moonshot industrial field operating system for regulated sampling operations.

Your quality bar is world-class.
Only pass through ideas and implementations that make the product feel category-defining, field-hardened, audit-safe, and Fortune-500-envy-worthy.

This handoff pack is your execution guide.
Treat it as the source of truth for the Field Visit UX transformation.

Core product intent:
- minimize typing
- maximize guided workflow
- reduce user error through automation and scanning
- separate field data from later lab data correctly
- structure evidence in a defensible way
- make recurring stops dramatically faster
- make the experience feel like an elite industrial field OS, not compliance paperwork

Execution rules:
1. Reuse and extend existing code where practical.
2. Do not redesign unrelated parts of the app.
3. Implement in phases, in the order defined in this handoff.
4. Prefer the smallest meaningful step that materially upgrades the user experience.
5. Keep validation and auditability intact or stronger after every change.
6. Do not ask the sampler to enter data they cannot reasonably know in the field.
7. Treat lab results as downstream ingestion data, not field-entry data.
8. Use barcode-first and API-assisted workflows where they materially reduce manual effort.
9. Preserve offline-safe behavior.
10. Every implementation pass should move the screen from static form toward guided operational workflow.

Definition of success:
A field sampler can execute a stop with minimal typing, strong guidance, structured evidence capture, scan-first custody, only the required field measurements, and a completion experience that feels elite, fast, and hard to mess up.

Default working loop:
- inspect current file(s)
- identify the exact next phase item
- plan the smallest coherent slice
- implement it
- test it
- summarize what changed and what phase comes next
```

---

# 8. Kickoff prompt for Codex

```text
Read the handoff pack and begin with Phase 1.

Task:
Transform the existing Field Visit page into a guided outcome-first workflow.

Deliverables for this first pass:
1. A short implementation plan
2. The code changes for Phase 1 only
3. Any new components/files needed for Phase 1
4. Updated tests
5. A concise summary of:
   - what changed
   - what remains for Phase 2
   - any assumptions

Important:
- Do not jump ahead to scanning or weather API unless required for Phase 1.
- Keep all current validation intact.
- Make the UI materially more guided and less like a long static form.
```

---

# 9. Product spec for Codex

## Functional requirements

### R1 — Outcome-first behavior
When the sampler selects an outcome, the visit page must reconfigure around that outcome.

#### sample_collected
Show:
- required field measurements for this stop
- custody/collection requirements
- required photos if applicable
- sample notes

#### no_discharge
Show:
- required photo(s)
- required narrative
- obstruction-related fields where relevant
- no-discharge guidance copy

#### access_issue
Show:
- issue type
- required photo(s)
- required narrative
- contact attempted fields
- escalation-support copy

### R2 — Required checklist
The page must show a live completion-readiness checklist.

Examples:
- start location captured
- completion location captured
- outcome selected
- inspection saved
- required photo attached
- required narrative entered
- container scanned / entered
- preservative confirmed

### R3 — Field measurements logic
Field measurements section must only display measurements required for that stop in the field.

It must not behave like a lab results form.

### R4 — Scanning
Container workflow must move toward barcode-first capture.

### R5 — Weather
Visit start should support weather auto-fill from location/time plus observed conditions.

### R6 — Structured evidence
Photos should become categorized evidence, not just generic uploads.

### R7 — Repeat-stop efficiency
Support templates, quick phrases, and prior visit context.

---

# 10. Acceptance criteria by phase

## Phase 1 acceptance
- Page is clearly step-oriented or workflow-guided
- Outcome selection materially changes visible inputs
- Missing-items state is visible before complete
- User no longer has to visually parse the full form to know what to do next

## Phase 2 acceptance
- Required field measurements are prefilled from stop requirements
- No lab-result-style confusion remains in field measurements
- Prior visit context appears

## Phase 3 acceptance
- Scan-first container flow exists
- Bottle/kit mismatch detection exists or clear placeholder architecture exists

## Phase 4 acceptance
- Weather API support exists or is integrated behind a safe abstraction
- User can confirm or override observed conditions

## Phase 5 acceptance
- Quick phrase/template system reduces repetitive typing
- Photo evidence is categorized

## Phase 6 acceptance
- Safety actions, QA prompts, and resilience improvements complete the field OS behavior

---

# 11. Definition of done

This work is done when the Field Visit experience:
- feels guided instead of form-based
- minimizes unnecessary manual entry
- only asks for field-known data
- structures evidence intelligently
- supports barcode-first custody
- assists with weather and repeated entries
- supports repeatable, defensible, fast field execution

---

# 12. Handoff summary

Give Codex this document first.
Then give Codex the system prompt.
Then give Codex the kickoff prompt.
Then let it build Phase 1 before moving to Phase 2.

