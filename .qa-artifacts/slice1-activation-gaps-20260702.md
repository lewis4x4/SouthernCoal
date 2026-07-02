# Slice 1 — Activation gaps (Phase 2 entry)

**Date:** 2026-07-02  
**Org:** Southern Coal Corporation (`2bffc35c-e2c4-4396-868f-207f80e1e2c4`)  
**Source:** `report_slice1_activation_gaps()` via prod SQL

## Funnel (ECHO violations → internal graph)

| Stage | Violation keys |
|-------|---------------:|
| Total distinct violation keys | 13,199 |
| No internal permit | 4,383 |
| Has permit | 8,816 |
| Has outfall | 4,365 |
| Has parameter | 3,442 |
| Has permit_limit | 2,441 |

**Mirror keys (exceedance path):** 15,179  
**Pending missing_internal:** 144,649  
**Synthetic ECHO limits (SYNTHETIC_UAT_SLICE1):** 301  
**Permits without federal override (VA registry gaps):** 32

## Top permits missing limits (priority backfill)

| NPDES ID | Missing limit keys |
|----------|-------------------:|
| KYGE40869 | 144 |
| WV1018965 | 63 |
| WV1021079 | 55 |
| WV1026488 | 51 |
| WV1021338 | 48 |
| WV1022580 | 48 |
| WV1018736 | 42 |
| WV1018779 | 39 |
| WV1006304 | 38 |
| WV1022652 | 36 |

## Phase 2 priority order

1. **Synthetic limit triage** — 301 rows; export for human PDF verify/dispute in External Data UI
2. **Registry gaps** — 32 VA permits; map one via `/compliance/external-data` with confirmation basis
3. **Limit backfill** — start with KYGE40869 (Slice 2 DMR fixture); `qa:slice1-seed-permit-limits`
4. **Exceedance mirror** — 15,179 keys available; `qa:slice1-seed-exceedances` → reconcile
5. **Scoped detect** — re-run on permits that gain internal data

## Blocker

Local QA scripts require `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (currently only `VITE_SUPABASE_*` present).
