# Lane A — Staging preflight (automated gate)

**Date:** 2026-07-01  
**Branch:** `main`  
**Base commit:** `b936541` (+ uncommitted M1 preflight wiring)  
**Environment:** Local Vitest (staging browser QA not run this session)

## Decision

**Track:** Lane A staging QA — not “wait for client data” (outreach accelerates populated states; it does not gate builds).  
**PR #21:** Merged (overnight goal pack on `main`).

## Automated gates

| Gate | Command | Result |
|------|---------|--------|
| M1 online field execution | `npm run qa:lane-a-m1` | **Pass** — 7 files, 76 tests |
| M2 offline sync slice | `npm run qa:lane-a-m2` | **Pass** — 6 files, 69 tests |
| Combined | `npm run qa:lane-a` | **Pass** |

### M1 coverage map (`src/lib/milestone1QaMap.ts`)

| ID | Primary tests |
|----|----------------|
| A1 | `fieldVisitInspectionRouting`, `fieldRouteLocalCache` |
| A2 | `fieldVisitCompletionValidation`, `fieldVisitRequirements` |
| A3 | `fieldVisitCompletionValidation` (GPS) |
| A4 | `fieldOutboundQueue` (`complete_field_visit`) |
| A5 | `milestone1QaCoverage` + Audit Log field-visit presets |
| A6 | `fieldOutboundQueue`, `fieldSyncPending` |

### M2 coverage map (`src/lib/milestone2QaMap.ts`)

| ID | Primary tests |
|----|----------------|
| B1 | `fieldRouteLocalCache`, `fieldVisitLocalCache` |
| B2 | `fieldOutboundQueueDiagnostic`, `fieldSyncPending` |
| B3–B4 | `fieldOutboundQueue` |
| B5 | `milestone2QaCoverage` + conflict-hold audit preset |

## Manual staging still required

Automation proves code regressions only. Human sign-off still needed on staging with a WV field user:

1. [`Roadmap/LANE_A_MILESTONE_1_QA.md`](../Roadmap/LANE_A_MILESTONE_1_QA.md) — A1–A6  
2. [`Roadmap/LANE_A_MILESTONE_2_QA.md`](../Roadmap/LANE_A_MILESTONE_2_QA.md) — B1–B5 (airplane mode or DevTools Offline after online load)

**Preconditions:** `wv-uat-sampler@invalid.scc.local` (or production field_sampler), today's route with visits, `audit_log` access.  
**Go-Live UI:** `/admin/go-live` — seed smoke templates `lane-a-m1` + `lane-a-m2` to track manual pass/fail.

Prior browser run (2026-05-26): [LANE_A_M2-qa-20260526.md](./LANE_A_M2-qa-20260526.md) — partial B1 route dual-cache follow-up on real airplane mode.

## Lane A closure gate

Per `plans/LANE_A_FIRST.md`: Lane A is **done** when A1–A6 **and** B1–B5 both close. Engineering on Lanes B/C continues in parallel.
