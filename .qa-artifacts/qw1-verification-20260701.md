# Lane C QW1 — Calendar-gap detector verification (2026-07-01)

**Spec:** `docs/QUICK_WINS.md` §QW1, `docs/UNIFIED_MASTER_ROADMAP.md` §3  
**Route:** `/compliance/missed-at-risk`  
**Automated gate:** `npm run qa:qw1` — pass (6 tests)

## Already shipped (commit `af3cff5`)

| Layer | Artifact |
|-------|----------|
| DB | `20260701120000_sampling_calendar_gap_detection.sql` — tables, RPCs, RLS, pg_cron |
| Cron | `detect-sampling-calendar-gaps-nightly` @ **06:00 UTC** (active in prod) |
| UI | `MissedAtRiskPage` + summary cards, table, triage panel |
| Nav | Compliance → **Missed / At-Risk** (`COMPLIANCE_ADVANCED_ROLES`) |
| Audit | `sampling_gap_detection_*` + `sampling_gap_review_updated` in `audit_log` |

## Activation slice (this session)

| Step | Result |
|------|--------|
| UAT calendar seed | `scripts/seed-qw1-uat-calendar.sql` — 2 schedules, 4 calendar rows |
| Manual detection RPC | **Pass** — scanned 3, opened **2** gaps (1 missed + 1 at-risk) |
| Excused row | `status=skipped` calendar excluded (no gap) |
| Future row | Outside 2-day horizon — no gap |

### Open gaps (UAT org `f0000001…`)

| Kind | Severity | Days late | Scheduled |
|------|----------|-----------|-----------|
| missed | high | 21 | 2026-06-10 (pH) |
| at_risk | medium | 0 | 2026-07-02 (TSS) |

## Manual smoke

1. Log in as `wv-uat-admin@invalid.scc.local` on Netlify.
2. Open `/compliance/missed-at-risk` — confirm 2 rows + DRAFT disclaimer banner.
3. Select a row → triage to **Acknowledged** (requires `verify` permission).
4. Click **Run gap detection** — toast shows scan counts; audit_log rows present.

## Empty-state behavior (production SCC)

`sampling_calendar` is empty until the Sampling Matrix lands — detector runs nightly with **0 scans** and shows the empty-state copy. No penalty dollars asserted.

## Next (Lane C)

**QW2** — ¶49 48-hour EDD-arrival clock + exceedance-only-data flag.
