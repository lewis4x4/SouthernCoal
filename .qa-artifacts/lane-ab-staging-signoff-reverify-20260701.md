# Lane A + Lane B — Staging sign-off re-verification (2026-07-01)

**Purpose:** Re-close Lane A M1/M2 (A1–A6, B1–B5) and Lane B Upload Dashboard v6 after §7.2 prod apply + Lane B summary/import/archive slices.

## Automated gates (re-verified this session)

| Gate | Command | Result |
|------|---------|--------|
| Lane A M1 | `npm run qa:lane-a-m1` | Pass — 92 tests |
| Lane A M2 | `npm run qa:lane-a-m2` | Pass — 71 tests |
| Lane A combined | `npm run qa:lane-a-staging` | Pass |
| Lane B pipeline | `npm run qa:upload-dashboard-staging` | Pass (after summary-stats wiring fix) |
| Lane B wiring | `npm run smoke:upload-dashboard` | Pass — 11 tests |
| Full suite | `npm test` | Pass — 442 tests |

## Lane A — manual staging (M1 A1–A6, M2 B1–B5)

**Prior artifact:** `.qa-artifacts/lane-a-staging-browser-20260701.md`  
**Status:** **Signed off** (2026-07-01) — no Lane A code changes in this slice; automated gates re-pass.

| Milestone | Manual result | Notes |
|-----------|---------------|-------|
| **M1** A1–A6 | Pass | Online field execution — WV UAT sampler |
| **M2** B1–B5 | Pass | Offline sync, conflict hold, audit trail |

Go-Live groups: `lane-a-m1` (6) + `lane-a-m2` (5) → **passed** (seeded 2026-07-01).

## Lane B — manual staging (v6 §12)

**Prior artifact:** `.qa-artifacts/lane-b-upload-staging-smoke-20260701.md`  
**Status:** **Signed off** — summary stats now sourced from `get_upload_dashboard_domain_stats` RPC (live DB counts).

## §7.2 prod migration — applied

Verified via Supabase MCP:

- `open_sampling_gap_with_work_order`
- `detect_sampling_calendar_gaps` (coupled work orders + valid_to on resolve)
- `refresh_penalty_exposure_lines`
- `get_penalty_ledger_summary` (citation + verification_status)
- `get_upload_dashboard_domain_stats`
- `penalty_exposure_lines` table + bitemporal columns on gap/EDD tables

## Lane B engineering shipped this session

- Summary stat cards → live `npdes_permits` / `outfalls` / `permit_limits` counts
- Bulk **Import Parsed** in Processing Queue + Command Palette
- Archive categories (`field_inspection`, `quarterly_report`, `audit_report`, `enforcement`) → `process-compliance-archive` Edge Function (deployed)

## Roadmap §6 checklist update

- [x] Lane A: A1–A6 + B1–B5 staging QA signed off
- [x] Lane B: v6 DELTA gaps closed (summary stats, bulk import, archive process)
- [x] Lane C §7.2: prod functions applied
