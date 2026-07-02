# Slice 1 — exceedance batch seed (Rule 2 unlock)

**Date:** 2026-07-02  
**Label:** `SYNTHETIC_UAT_SLICE1` — not regulatory data

## Prod progress

| Metric | Before | After initial batches |
|--------|-------:|----------------------:|
| `exceedances` (SCC org) | 49 | **1,246** |
| `dmr_submissions` | 1 | 1 (KYGE40869 synthetic) |

## How to continue seeding

```bash
# Requires service role in env
SUPABASE_URL=https://zymenlnwyzpnohljwifx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run qa:slice1-seed-exceedances -- --limit 250 --batches 20
```

Each batch inserts up to **250** distinct ECHO violation keys (cap 500) not yet mirrored as internal exceedances. ~90K distinct keys remain — run batches until `seeded: 0`.

## After seeding

Re-run scoped ECHO detect (`npm run qa:slice3-echo-batch-detect`) — `missing_internal` should drop proportionally to seeded exceedance keys.

## RPC

`seed_slice1_exceedances_from_echo(p_organization_id, p_limit)` — migration `20260703200000`
