# Slice 1 phase 3 — KYGE40869 activation chain (session status)

**Date:** 2026-07-03  
**Branch:** `cursor/kyge40869-activation-chain-26e8`  
**Org:** Southern Coal Corporation (`2bffc35c-e2c4-4396-868f-207f80e1e2c4`)

## Shipped this session

| Item | Status |
|------|--------|
| PR #22 — `loadEnvLocal()` in slice1 QA scripts + slice3 `--permit` | Merged on `main` |
| PR #25 — `qa:slice1-activation-chain` orchestrator | Merged on `main` |
| Vitest env fallbacks for cloud/CI (no `.env.local` required) | On branch |
| Verify (576/576 tests, build) | Green |

## Prod chain — not executed (cloud blocker)

Cloud agent has no `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Prod RPC chain must run on Brian's machine:

```bash
# One command (recommended):
npm run qa:slice1-activation-chain

# Or step-by-step:
npm run qa:slice1-activation-gaps -- --suffix before
npm run qa:slice1-seed-exceedances -- --limit 250 --batches 10
npm run qa:slice1-repair-stuck-keys -- --limit 100
npm run qa:slice1-reconcile -- --limit 10000 --batches 10
npm run qa:slice1-activation-gaps -- --suffix after
npm run qa:slice3-echo-batch-detect -- --permit KYGE40869
```

## Phase 4 (next after prod phase 3)

```bash
npm run qa:slice1-seed-propagated-limits -- --permit WV1018965
npm run qa:slice1-activation-chain -- --permit WV1018965
```

## Baseline (2026-07-02, pre–phase 3 prod run)

| Metric | Value |
|--------|------:|
| `has_permit_limit` funnel stage | 2,441 |
| KYGE40869 missing limit keys | 144 (top gap — **144 limits propagated in phase 2**) |
| Pending `missing_internal` | 144,649 |
| Org exceedances (last seed run) | 17,251 |

## Acceptance targets (after prod run)

- `has_permit_limit` increases vs baseline
- KYGE40869 off top gap list (144 limits already on prod from phase 2)
- `seed_slice1_exceedances_from_echo` inserts > 0
- `reconcile_missing_internal_discrepancies` resolves > 0
- Scoped detect on KYGE40869: `missing_internal` count drops vs ~3,433 baseline

Combined artifact path: `.qa-artifacts/slice1-kyge40869-activation-chain-YYYYMMDD.md`
