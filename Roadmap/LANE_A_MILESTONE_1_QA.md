# Lane A Milestone 1 — QA checklist

Use with [`LANE_A_MILESTONE_1.md`](./LANE_A_MILESTONE_1.md). **Tester:** _______________ **Date:** _______________ **Environment:** _______________

## Preconditions

- [ ] Logged in as a user with field access for org with WV (or configured) dispatch data.
- [ ] At least one **assigned** or **in progress** visit exists on **today’s route** (or dispatch creates one).
- [ ] Browser allows geolocation if testing GPS capture (or use manual lat/long).

---

## A1 — Today’s route

- [ ] Open **Field dispatch** → confirm WV (or target state) filter loads without “empty state” errors when data exists.
- [ ] Open **Today’s route** → list matches expected stops for the day.
- [ ] Open a visit from that route → **Field visit** page loads (not “Field visit unavailable”).

**Pass / fail / notes:**

---

## A2 — Outcome evidence gates

Complete each path once (or spot-check):

| Outcome | Blockers to confirm |
|---------|---------------------|
| Sample collected | No complete without **container ID** + **preservative confirmed** + **outlet flow** not “unknown”. |
| No discharge | No complete without **≥1 photo**, **narrative**, and if obstruction checked → **obstruction details**. |
| Access issue | No complete without **≥1 photo** and **access narrative**. |

- [ ] Toasts reference **why** the record is blocked (compliance-oriented wording).

**Pass / fail / notes:**

---

## A3 — GPS at complete

- [ ] Complete blocked when lat/long empty or non-numeric.
- [ ] GPS capture (if used) fills fields and allows complete when other gates pass.

**Pass / fail / notes:**

---

## A4 — Online RPC

- [ ] Online complete → visit shows **completed** after refresh; DB / UI consistent.
- [ ] `complete_field_visit` errors surface as toast (not silent failure).

**Pass / fail / notes:**

---

## A5 — Client audit

In **`audit_log`** (or Audit Log UI if filtered):

- [ ] After **online** complete: row with action **`field_visit_completed`** for that visit.
- [ ] After **offline** or queued complete: row with **`field_visit_completion_queued`** (complete offline, then check before sync if needed).

**Pass / fail / notes:**

---

## A6 — Offline queue

- [ ] Airplane mode (or throttled offline): complete queues; toast indicates sync when back online.
- [ ] Re-online: **FieldDataSyncBar** / queue processes without losing the completion.

**Pass / fail / notes:**

---

## Automated coverage (Vitest — run before staging)

Run: `npm run qa:lane-a-m1` (focused Vitest gate + manual checklist reminder). Combined M1+M2 gate: `npm run qa:lane-a`. Full suite: `npm run preflight` or `npm test`.

| Criterion | Primary test files | What automation proves |
|-----------|-------------------|------------------------|
| **A1** | `fieldVisitInspectionRouting.test.ts`, `fieldRouteLocalCache.test.ts` | Route/visit navigation wiring; durable route cache matching |
| **A2** | `fieldVisitCompletionValidation.test.ts`, `fieldVisitRequirements.test.ts` | Outcome evidence gates block incomplete records |
| **A3** | `fieldVisitCompletionValidation.test.ts` | GPS coordinate validation at start/complete |
| **A4** | `fieldOutboundQueue.test.ts` | Online `complete_field_visit` RPC path |
| **A5** | `milestone1QaCoverage.test.ts` + Audit Log UI presets | `field_visit_completed` / `field_visit_completion_queued` audit constants |
| **A6** | `fieldOutboundQueue.test.ts`, `fieldSyncPending.test.ts` | Offline queue enqueue + pending sync visibility |

Canonical action list: `src/lib/milestone1QaMap.ts` (`MILESTONE_1_FIELD_AUDIT_ACTIONS`).

Staging QA still required for UX copy, airplane-mode, real JWT/RLS, and WV dispatch data — automation reduces code regressions only.

---

## Sign-off

Milestone 1 **accepted** / **not accepted** — **Reason:**
