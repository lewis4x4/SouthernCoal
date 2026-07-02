# Slice 1 — domain activation verification

**Org:** `2bffc35c-e2c4-4396-868f-207f80e1e2c4`  
**Date:** 2026-07-02

| Check | Result |
|-------|--------|
| Summary RPC permits/outfalls/limits | 141 / 823 / 7456 — matches raw SQL |
| Lab results (via permit graph) | 771 |
| DMR submissions (SCC org) | 1 (SYNTHETIC_UAT_SLICE1, KYGE40869 Jan 2026) |
| Fixture | `supabase/seeds/uat/slice1-synthetic-netdmr-kyge40869.csv` |

**Note:** Prod `dmr_submissions` uses CMS column names (`reporting_period_*`); import-netdmr-dmr targets newer schema pending ledger reconciliation.
