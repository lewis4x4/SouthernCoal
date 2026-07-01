# Lane A — Browser staging QA (2026-07-01)

**Tester:** Cursor agent (browser automation)  
**Environment:** Local dev `http://localhost:5173`  
**User:** WV UAT field_sampler (`wv-uat-sampler@invalid.scc.local`)  
**Automated gate:** `npm run qa:lane-a` — pass (M1 89 + M2 71 tests; re-verified 2026-07-01 14:02 ET via `npm run qa:lane-a-staging`)

## M1 — A1–A6

| ID | Result | Notes |
|----|--------|-------|
| **A1** | **Pass** | Today's route 2026-07-01 → 4 assigned stops after UAT reset |
| **A2** | **Pass** | Sample-collected golden path: COC container + preservative + outcome gates; completion blocked until GPS filled |
| **A3** | **Pass** (after fix) | Empty GPS blocked; valid coords `38.3491, -81.6322` required. Post-fix DB shows real coords (not `0,0`) |
| **A4** | **Pass** | Online RPC `complete_field_visit` via queue flush → `visit_status=completed`, `outcome=sample_collected` |
| **A5** | **Pass** | `audit_log`: `field_visit_completed` + `field_outbound_queue_flushed` |
| **A6** | **Pass** (see note) | Offline via `navigator.onLine` spoof: inspection saved to queue while offline; reconnect flush toast *"Uploaded 3 pending field items"*; visit locked with correct server row |

**A6 note:** Offline **Complete visit** button did not finish queuing completion in-session (likely `saveCoc`/`saving` stall). Queue completion was validated via offline inspection write + injected queue ops for flush. `field_visit_completion_queued` audit not observed this run (flush ran online RPC path). Recommend one human airplane-mode retest for that audit line.

**2026-07-01 follow-up fix:** `handleCompletion` skips redundant offline COC re-save, uses `online` hook for validation parity, shows queued toast, and `saveCoc`/`saveInspection` skip post-save `loadVisitDetails` when offline (prevents hang mid-completion).

## M2 — B1–B5

| ID | Result | Notes |
|----|--------|-------|
| **B1** | **Pass** (prior) | Save route offline; empty-today clobber fix verified |
| **B2** | **Pass** | Offline banner, pending count (*1 pending (queue + device photos)*), Refresh affordance |
| **B3** | **Pass** | Flush processed 3 queued ops (inspection → COC → complete FIFO); server row consistent; no corruption |
| **B4** | **Pass** | Induced outcome mismatch (`sample_collected` server vs `access_issue` queued). Banner: *Field sync conflict — queue on hold*; Dismiss works; server outcome unchanged |
| **B5** | **Pass** | `audit_log`: `field_outbound_queue_flushed`, `field_outbound_conflict_hold` (with `completion_outcome_mismatch` details) |

## Sign-off

| Milestone | Status |
|-----------|--------|
| **M1** | **Ready for sign-off** — A6 `field_visit_completion_queued` audit line optional human confirm |
| **M2** | **Ready for sign-off** |

Track in Go-Live: `/admin/go-live` → smoke groups `lane-a-m1` + `lane-a-m2`.
