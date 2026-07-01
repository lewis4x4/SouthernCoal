# Lane C — Draft penalty ledger activation (2026-07-01)

**Spec:** `docs/UNIFIED_MASTER_ROADMAP.md` §3 (draft-labeled penalty ledger)  
**Route:** `/compliance/penalty-ledger`  
**Automated gate:** `npm run qa:penalty-ledger` — pass (4 tests)

## Already shipped (migration `20260701190000`)

| Layer | Artifact |
|-------|----------|
| DB | `calculate_draft_miss_sampling_penalty`, `get_penalty_ledger_summary`, sign-off RPC |
| UI | `PenaltyLedgerPage` — DRAFT banner, 4 source rows, counsel sign-off |
| Cron | Daily CD obligation penalty refresh |
| RBAC | `PENALTY_LEDGER_ROLES` |

## Activation slice

| Step | Result |
|------|--------|
| Migration | Applied prod — RPC uses `get_user_org_id()` (no args) |
| UAT data | QW1 missed gaps feed **draft miss estimate** ($3,000 tier for 21+ days late) |
| Labeling | All totals marked **DRAFT — internal estimate** until counsel sign-off |

## Manual smoke

1. Log in as `wv-uat-admin@invalid.scc.local`.
2. Open `/compliance/penalty-ledger`.
3. Confirm DRAFT banner + source breakdown (FTS / gaps / obligations / violations).
4. Sign-off button requires `admin` / `executive` / `coo` / `chief_counsel`.

## Hard gate

Counsel sign-off records audit only — **does not** remove DRAFT for external/legal use without human verification.
