# Lane A — Active milestone (Milestone 1)

**Status:** Active  
**Last agreed:** 2026-04-01  
**QA checklist:** [`LANE_A_MILESTONE_1_QA.md`](./LANE_A_MILESTONE_1_QA.md)  
**Supersedes:** Informal “build field stuff” until this milestone is met or explicitly replaced.

**Canonical execution order** for the WV spine remains [`SCC Water Sampling Platform — Codex Handoff Roadmap.md`](./SCC%20Water%20Sampling%20Platform%20—%20Codex%20Handoff%20Roadmap.md). This file is the **product milestone** that current engineering work should optimize for.

---

## North star (one sentence)

> **A WV sampler can run today’s assigned route online, complete each stop with a legally coherent outcome, satisfy outcome-specific evidence rules on the device, and have completions visible in Supabase with client-side audit visibility for online completes and for offline-queued completions.**

---

## In scope

- **Route today** flow: dispatch → “today’s route” → per-visit execution (`FieldRouteTodayPage`, `FieldVisitPage`).
- **Outcomes:** `sample_collected`, `no_discharge`, `access_issue` (current type model).
- **Evidence:** photos, outlet inspection, COC primary container for samples, no-discharge / access narratives as already enforced in UI.
- **Sync:** optimistic outbound queue when offline or on RPC failure; `FieldDataSyncBar` / queue processing unchanged except as needed for milestone acceptance.
- **Governance:** creation of governance issues from completion when the RPC returns them (existing behavior).

## Out of scope (until Milestone 1 is met)

- Full **Codex Phase 4** “airplane mode all day” certification (tracked as the **next** milestone after this one).
- DMR calculation, ECHO triage, Upload Dashboard (Lane B) except where they block real WV test data.
- Multi-state parameterization beyond what WV already needs.

---

## Acceptance criteria (definition of done)

| # | Criterion | How we verify |
|---|-----------|----------------|
| A1 | Sampler can open **today’s** WV route and step through visits without dispatch context errors when data exists. | Manual / QA on org with `FIELD_DISPATCH_STATE_CODE` routes. |
| A2 | **Complete visit** is blocked until outcome-specific rules pass (COC for sample, photos + narrative for no-discharge/access as implemented). | `FieldVisitPage` validation + tests. |
| A3 | **GPS coordinates** are required (or explicitly captured) at completion per current UI rules. | Same. |
| A4 | **Online** completion writes through `complete_field_visit` and refreshes visit detail. | Network on; DB row `completed`. |
| A5 | **Client audit_log** records each **online** completion and each **queued** completion (fire-and-forget). | `audit_log.action` = `field_visit_completed` / `field_visit_completion_queued`. |
| A6 | **Offline or fail-over queue** still allows complete-with-sync-later without silent data loss. | Airplane mode / queue length + sync. |

---

## Codex phase mapping

| Codex | Relation to Milestone 1 |
|-------|-------------------------|
| Phase 2 — Calendar & routes | **Input:** must produce assignable work; tighten only if A1 fails in real data. |
| Phase 3 — Field execution | **Core:** A2–A4. |
| Phase 4 — Offline sync | **Partial:** A6; full Phase 4 = later milestone. |
| Phase 0.5 — Verification | **Parallel:** recommended; not a hard gate for this milestone unless leadership says so. |

---

## Implementation slices (ordered)

1. **Milestone artifact + code anchor** — this doc; `src/lib/laneAMilestone.ts`. **Done.**
2. **Audit visibility on completion** — `useAuditLog` in `useFieldOps.completeVisit` (online + queued). **Done.**
3. **Harden validation / copy** — `src/lib/fieldVisitValidationCopy.ts` wired in `FieldVisitPage`. **Done.**
4. **QA script** — [`LANE_A_MILESTONE_1_QA.md`](./LANE_A_MILESTONE_1_QA.md). **Done.**

Next focus: run the QA checklist in staging, then close Milestone 1 or open gaps as tickets.

---

## Code map

| Area | Location |
|------|----------|
| Visit UI & validation | `src/pages/FieldVisitPage.tsx`, `src/lib/fieldVisitValidationCopy.ts` |
| Dispatch / visits / complete RPC | `src/hooks/useFieldOps.ts` |
| Outbound queue | `src/lib/fieldOutboundQueue.ts` |
| Milestone constants | `src/lib/laneAMilestone.ts` |
| Client audit | `src/hooks/useAuditLog.ts` |

---

## When to close or revise

Close Milestone 1 when **A1–A6** are satisfied in staging (or production pilot).  
Open **Milestone 2** (proposal): *Codex Phase 4 vertical slice — durable offline route + sync conflict visibility + audit trail for sync resolution.*
