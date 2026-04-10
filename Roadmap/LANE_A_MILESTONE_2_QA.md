# Lane A Milestone 2 — QA checklist

Use with [`LANE_A_MILESTONE_2.md`](./LANE_A_MILESTONE_2.md) (acceptance **B1–B5**). **Tester:** _______________ **Date:** _______________ **Build / commit:** _______________ **Environment:** _______________

## Preconditions

- [ ] Milestone 1 preconditions satisfied where they overlap (field user, WV route data, at least one visit path) — see [`LANE_A_MILESTONE_1_QA.md`](./LANE_A_MILESTONE_1_QA.md).
- [ ] **Online load first:** today’s route and at least one visit have been loaded successfully while online (establishes cache + queue baseline).
- [ ] DevTools or device can disable network (**airplane mode** or **Offline** in Application / Network tab).
- [ ] Access to **`audit_log`** (table or Audit Log UI) for the test user’s org.

**Staging base URL:** _fill_

---

## B1 — Durable offline route + visit context

Goal: With **network off**, sampler can open **today’s route** and **visit shells** from local durable data **after** a prior online load.

- [ ] While **online**, open **Today’s route** and one **Field visit** — confirm **live** load (e.g. `FieldDataSourceBanner` not showing cache-only warning, or as documented for your build).
- [ ] Turn **network off**.
- [ ] Reload or navigate back to **Today’s route** — list/stops still usable; no unrecoverable empty error if cache was populated on prior load.
- [ ] Open the same **visit** — shell loads from cache path; **documented cold-start** limitation: if first load is offline and route is empty, user sees **clear message** (expected per product; note pass/fail).

**Pass / fail / notes:**

---

## B2 — Sync health: queue + evidence drafts

Goal: **Actionable** visibility for pending outbound work, evidence upload failures, and which visit is blocked.

- [ ] With a **pending** outbound op or **failed** evidence upload (induce via throttled network or a controlled failure if available): **FieldDataSyncBar** (or visit header link `#field-sync-health`) shows **counts / last error / blocking visit** in a way QA can act on.
- [ ] **FieldOutboundQueueDiagnostic** (if used in your test flow) reflects blocked queue state consistently with the bar.

**Pass / fail / notes:**

---

## B3 — Reconnect flush ordering

Goal: After offline work, **reconnect** flush preserves intended ordering: **evidence uploads before dependent RPCs** where the code enforces it; **no corruption** of completed visit rows on failure.

- [ ] Queue at least one completion or evidence-bearing path **offline**, then go **online** and let flush run.
- [ ] Observe: failed step surfaces without marking visit **completed** in UI/DB incorrectly; retry path is clear.
- [ ] Spot-check ordering vs code expectation (evidence before RPC) — **notes only** if full trace is dev-assisted.

**Pass / fail / notes:**

---

## B4 — Conflict hold (no silent overwrite)

Goal: When server state conflicts with queued client work (e.g. terminal visit on server, outcome mismatch), user sees **hold / error / review posture** — **not** silent overwrite.

- [ ] Induce or use a **conflict-hold** path (e.g. `FieldOutboundConflictHoldError` / sync bar **conflict** title).
- [ ] Confirm **toast or banner** explains the situation; user can **retry** or **dismiss** per product behavior.
- [ ] Confirm server row was **not** overwritten without explicit resolution.

**Pass / fail / notes:**

---

## B5 — Audit trail (client)

Goal: **`audit_log`** rows for sync-resolution–class actions (flush, blocked queue, conflict hold, retry/dismiss where implemented).

- [ ] After flush / blocked / conflict-hold / retry / dismiss events in B2–B4, spot-check **`audit_log`** for expected actions (e.g. `field_outbound_queue_flushed`, `field_outbound_queue_blocked`, `field_outbound_conflict_hold` — exact set per build).
- [ ] No silent skip of audit on user-visible sync resolution (fire-and-forget failures are **noted** if observed).

**Pass / fail / notes:**

---

## Sign-off

Milestone 2 **accepted** / **not accepted** — **Reason:**

**Tester signature / date:** _______________
