# Lane A — Milestone 2 (active next phase)

**Status:** Active (engineering focus after M1 code readiness)  
**Last updated:** 2026-04-01  
**Depends on:** [`LANE_A_MILESTONE_1.md`](./LANE_A_MILESTONE_1.md) — implementation is in repo; **formal closure** = staging A1–A6 sign-off per [`LANE_A_MILESTONE_1_STAGING_CLOSURE_AND_BLOCKERS.md`](./LANE_A_MILESTONE_1_STAGING_CLOSURE_AND_BLOCKERS.md).  
**Codex mapping:** **Phase 4 — Offline sync and conflict resolution** ([`SCC Water Sampling Platform — Codex Handoff Roadmap.md`](./SCC%20Water%20Sampling%20Platform%20—%20Codex%20Handoff%20Roadmap.md)).

**Code anchor:** `src/lib/laneAMilestone.ts` — `LANE_A_MILESTONE_2_ID`.

---

## North star (one sentence)

> **A WV sampler can operate for an extended offline window with a durable local record of today’s route and visit work, reconnect without silent data loss, see clear sync health and blocked-queue reasons, and have conflict-prone outcomes surfaced for review instead of overwritten.**

This is a **vertical slice** toward Codex Phase 4 “done when”: *multi-hour offline, reconnect, one accurate record set* — not a promise to complete every Phase 4 bullet in one milestone.

---

## In scope (Milestone 2)

1. **Durable offline route + visit context** — Cached route/visit payloads survive refresh and typical PWA lifecycle better than “memory only”; explicit UX when working from cache vs live (build on `fieldRouteLocalCache`, `fieldVisitLocalCache`, existing outbound queue).
2. **Sync health & blocked-queue visibility** — User-visible states for: pending outbound ops, evidence upload failures, RPC failures, first blocking op (extend `FieldDataSyncBar`, `fieldOutboundQueueDiagnostic`, visit-level banners where needed).
3. **Conflict & review posture (narrow rules)** — Where the stack already detects impossible merges, prefer **visible error + hold** over silent overwrite; document deterministic rules in code comments + this file. Full merge-UI can stay minimal if “block + message + retry path” satisfies acceptance.
4. **Audit trail for sync-resolution actions** — Client `audit_log` (fire-and-forget) for: queue flush outcomes, user-dismiss vs retry, and any new “sync resolved” events we add (align with existing `field_outbound_queue_flushed`, `field_outbound_queue_blocked`).

## Out of scope (defer to later milestones)

- Full **“airplane mode all day” certification** playbook + formal Phase 0.5 verification artifact (can run in parallel, not a gate for M2 slice 1).
- **Lane B** Upload Dashboard completion, DMR engine, ECHO triage (per [`plans/LANE_A_FIRST.md`](../plans/LANE_A_FIRST.md) — only when Lane A is not the bottleneck).
- **Native shell** (Capacitor) unless a spike proves PWA insufficient.

---

## Acceptance criteria (definition of done)

| # | Criterion | How we verify |
|---|-----------|----------------|
| B1 | With network off, sampler can open **today’s route** and **visit shells** using durable local data after a prior online load (or documented cold-start limitation + message). | Manual / QA + cache inspection. |
| B2 | **Outbound queue + evidence drafts** show **actionable** status: counts, last error, which visit is blocked. | UI review + existing diagnostics. |
| B3 | **Reconnect flush** preserves order: evidence uploads before dependent RPCs where the code path already enforces it; failures do not corrupt completed visit rows. | A6-style QA + code trace. |
| B4 | **No silent overwrite** on legally meaningful fields when two sources disagree — user sees error or review state (narrow cases acceptable for M2). | Test + UX copy. |
| B5 | **Audit**: new or existing actions cover sync flush, blocked queue, and user retry/dismiss where implemented. | `audit_log` spot-check. |

---

## Implementation slices (ordered)

1. **Milestone artifact** — this doc; `LANE_A_MILESTONE_2_ID` in `laneAMilestone.ts`. **Done** when merged.
2. **Offline/cache UX honesty** — banners or badges on `FieldRouteTodayPage` / `FieldVisitPage` when data is from cache vs live (reuse load alerts patterns). **Shipped:** `FieldDataSourceBanner`, `detailLoadSource` in `useFieldOps`.
3. **Queue + evidence diagnostics** — consolidate “why sync failed” into one discoverable surface (sync bar + visit header). **Shipped:** `FieldDataSyncBar` hosts queue-blocked + evidence upload failures (`#field-sync-health`); visit header link when either is active.
4. **Conflict hold rules** — identify 1–2 real conflict paths in outbound flush; implement block + toast + audit, not auto-merge. **Shipped:** pre-flight in `processFieldOutboundQueue` for `field_visit_start` (server terminal) and `field_visit_complete` (outcome mismatch); `FieldOutboundConflictHoldError`; audit `field_outbound_conflict_hold`; diagnostic `conflictHold` + sync bar title.
5. **QA script** — add `LANE_A_MILESTONE_2_QA.md` (short B1–B5 checklist) when slice 2–4 land.

---

## Code map (starting points)

| Area | Location |
|------|----------|
| Outbound queue | `src/lib/fieldOutboundQueue.ts`, `useFieldOps.flushOutboundIfOnline` |
| Evidence drafts | `src/lib/fieldEvidenceDrafts.ts`, `FieldVisitPage` |
| Route / visit cache | `src/lib/fieldRouteLocalCache.ts`, `src/lib/fieldVisitLocalCache.ts` |
| Sync UI | `src/components/field/FieldDataSyncBar.tsx` |
| Client audit | `src/hooks/useAuditLog.ts` |

---

## When to close or revise

Close Milestone 2 when **B1–B5** are satisfied in staging for the agreed WV test org.  
Then propose **Milestone 3** (e.g. governance inbox depth, lab linkage hardening, or Phase 0.5 verification) per Codex Handoff priority.
