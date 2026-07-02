# Slice 4 / Task 3.36 — Review Queue bulk triage at volume

**Date:** 2026-07-02  
**Route:** `/review-queue`  
**Post-rerun volume:** ~181K `discrepancy_reviews` (mostly `missing_internal` / high)

## Shipped

| Item | Detail |
|------|--------|
| Migration | `20260703190000_bulk_discrepancy_triage_rpc.sql` |
| RPC | `bulk_mark_discrepancies_reviewed(severity, source, type, limit, notes)` — up to 10K rows, org-scoped, `reviewed_by` = caller |
| UI | **Review batch (N)** — server-side; **Review loaded (N)** — client cap 2K |
| Index | `idx_dr_org_status_sev_detected` (prior slice) |
| Virtualization | `@tanstack/react-virtual` table (3.43) |

## Manual UAT

- [ ] Filter **Type → Status Mismatch** (~103 rows) — triage individually or bulk
- [ ] Filter **Severity → High** + **Review batch** — confirm confirm dialog, pending count drops, audit log `discrepancy_reviewed` with `server_filtered: true`
- [ ] Scroll 2K loaded rows — virtualizer stays responsive
- [ ] Unauthorized role — triage buttons disabled (`verify` permission)

## Notes

- Bulk-marking `missing_internal` at scale is an **operational acknowledgment** that rows were surfaced post-rerun — not a compliance sign-off.
- Re-run detection after Slice 1 imports to convert rows to `value_mismatch` where internal DMR data exists.
