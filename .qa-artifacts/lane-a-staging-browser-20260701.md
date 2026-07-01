# Lane A — Browser staging QA (2026-07-01)

**Tester:** Cursor agent (browser automation)  
**Environment:** Local dev `http://localhost:5173`  
**User:** Existing session — field_sampler (WV UAT data)  
**Automated gate:** `npm run qa:lane-a` — pass (M1 76 + M2 69 tests)

## A1 — Today's route

| Step | Result | Notes |
|------|--------|-------|
| Field route page loads | **Pass** | `/field/route` renders Field Ops shell |
| Route list with UAT data | **Pass** | Date `2026-04-02` → 4 stops (WV-UAT-FAKE-001) |
| Visit from route | **Pass** | Visit `f00000c4-…0004` loads wizard (Review & Complete step) |

## B1 — Durable offline route + visit context

| Step | Result | Notes |
|------|--------|-------|
| Online load then Save route offline | **Pass** (after fix) | Apr 2 route saved to device cache |
| Offline reload same date | **Pass** (after fix) | *Open saved route date* → Apr 2; 4 stops + *Offline — saved route on this device* |
| Root cause (pre-fix) | Fixed | Auto-persist on mount saved empty `2026-07-01` snapshot, clobbering Apr 2 |

**Fix:** `FieldRouteTodayPage` — skip auto-persist and manual save when `dayVisitsLive.length === 0`.

## B2 — Sync health

| Step | Result | Notes |
|------|--------|-------|
| Offline banner | **Pass** | *Offline — shown data may be stale* + last-updated time |
| Refresh affordance | **Pass** | *Refresh field data from server* button visible while offline |

## B3–B5

Not exercised this session (no queued outbound ops / conflict holds induced).

## Sign-off

Milestone 1 **partial** / Milestone 2 **partial** — A1 + B1 + B2 pass locally after fix; B3–B5 + airplane-mode staging still need human sign-off.
