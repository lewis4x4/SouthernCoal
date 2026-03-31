# Phase 0.5 Verification Baseline

Date: 2026-03-31
Status: Implemented baseline artifact for Thin Slice 1

## Verified Current State

### Confirmed from live database or deployment
- `102` public tables exist in the linked Supabase project.
- `27` Edge Functions are currently deployed and active.
- Core datasets present in the linked project:
  - `142` permits
  - `831` outfalls
  - `7,456` permit limits
  - `771` lab results
  - `336,403` ECHO DMR rows
  - `146,019` discrepancy reviews
  - `10,409` audit log rows
  - `2,407` document chunks
  - `1,216` queue files
  - `49` exceedances
- `sampling_calendar` and `sampling_schedules` exist but have `0` rows.
- `dmr_submissions` and `dmr_line_items` exist but have `0` rows.

### Confirmed from repo
- The repo contains `50` local SQL migration files.
- The repo contains source for `18` Edge Function directories.
- The existing frontend is centered on ingest, monitoring, search, corrective actions, roadmap, and reporting/admin surfaces.
- The repo does not contain:
  - a field dispatch screen
  - a field visit execution screen
  - a governance issue inbox
  - service worker or offline sync infrastructure

## Verified Drift

### Deployment drift
- Deployed functions missing from repo source:
  - `bulk-import-lab-data`
  - `debug-fts-structure`
  - `sync-watch-emails`
  - `inbox-zero-project-linker`
  - `parse-fts-excel`
  - `import-permit-pdf`
  - `run-scheduled-reports`
  - `backfill-ky-dmrs`
  - `file-upload-handler`

### Migration drift
- The linked remote database has remote migration entries not present in the repo.
- The repo also contains at least one migration not applied remotely.
- Result: repo truth and database truth must be tracked separately until source parity is restored.

## Thin Slice 1 Guardrails
- Do not modify report generation, EDD import, or scheduled report paths.
- Reuse existing `outfalls`, `npdes_permits`, `sampling_events`, `lab_results`, `audit_log`, auth, and role patterns.
- Add only the minimum WV launch-spine objects needed for:
  - manual dispatch
  - field visit execution
  - photo-backed no-discharge documentation
  - photo-backed access issue escalation
  - Bill Johnson step-1 governance intake
- Explicitly defer:
  - route generation
  - offline sync
  - chain of custody transfer workflow
  - bottle/cooler logistics
  - DMR calculation
  - SLA auto-escalation beyond initial owner assignment

## Implemented Slice Contract
- New route surfaces:
  - `/field/dispatch`
  - `/field/visits/:id`
  - `/governance/issues`
- New backend objects are additive and isolated from existing report/import flows.
- Completion rules for WV field visits are enforced in the database:
  - `no_discharge` requires GPS, timestamps, a `no_discharge_events` row, and at least one photo
  - `access_issue` requires GPS, timestamps, an `access_issues` row, obstruction narrative, and at least one photo
  - `sample_collected` requires GPS, timestamps, and a linked `sampling_event`

## Remaining Verified Risks
- Storage bucket inventory is still only partially verified from repo conventions.
- Permit-limit review state distribution remains unverified even though review columns exist.
- Missing deployed function source is still a release-management blocker for any future work that touches those areas.
