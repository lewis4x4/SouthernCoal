# Slice 1 — domain activation progress (2026-07-02)

## Prod counts

| Metric | Start (session) | Current |
|--------|----------------:|--------:|
| `exceedances` (SCC) | 49 | **15,156** |
| `slice1_echo_mirror_keys` | 0 | **13,069** |
| Resolvable ECHO violation keys (permit limit graph) | ~61K | **~13K mirrored**, **15 remaining** |
| Pending `missing_internal` | 180,976 | 180,976 (unchanged until reconcile) |

## Root cause

Rule 2 `missing_internal` requires **internal exceedances** matching `npdes:outfall:parameter_code:YYYY-MM`. Detect **insert-only** — does not auto-resolve stale pending rows.

## Shipped

| Item | Detail |
|------|--------|
| `seed_slice1_exceedances_from_echo` | Mirror ECHO violations → lab_results → exceedances (`SYNTHETIC_UAT_SLICE1`) |
| `slice1_echo_mirror_keys` | Fast dedup ledger |
| `reconcile_missing_internal_discrepancies` | Resolves pending rows when exceedance key exists |
| Script | `npm run qa:slice1-seed-exceedances` |

## Run reconcile (after seeding)

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node -e "fetch(process.env.SUPABASE_URL+'/rest/v1/rpc/reconcile_missing_internal_discrepancies',{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_organization_id:'2bffc35c-e2c4-4396-868f-207f80e1e2c4',p_limit:10000})}).then(r=>r.json()).then(console.log)"
```

Loop until `resolved: 0`.

## Note

~78K distinct violation keys lack resolvable `permit_limits` — those remain `missing_internal` until Slice 1 permit/limit imports grow.
