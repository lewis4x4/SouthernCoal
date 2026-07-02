# Slice 6 — VA NPDES Manual Override + ECHO Coverage Panel (3.37 / 3.38)

**Date:** 2026-07-02  
**Org:** Southern Coal Corporation (`2bffc35c-e2c4-4396-868f-207f80e1e2c4`)  
**Route:** `/external-data` → **External Data Sync**

## Code status: SHIPPED

Engineering complete. One **manual UAT row** remains (map a real VA permit with confirmation basis in staging/prod).

## Migrations

| Migration | Purpose |
|-----------|---------|
| `20260703060000_slice6_va_npdes_confirmation_basis.sql` | `confirmation_basis`, `confirmation_reference`, `confirmed_at` on `npdes_id_overrides` + CHECK constraints |

## Automated verification

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Relevant tests:

- `src/lib/__tests__/slice6VaNpdesConfirmation.test.ts` — migration contract
- `src/lib/__tests__/slice6EchoCoverageClosure.test.ts` — UI wiring (3.37 / 3.38)
- `src/lib/__tests__/npdesMapping.test.ts` — federal ID + confirmation basis validation
- `src/lib/__tests__/externalDataRbac.test.ts` — sync RBAC (3.46)

## UI surfaces (3.37)

| Surface | Location |
|---------|----------|
| ECHO Sync Health | `SyncHealthPanel` — stale/full sync, recent runs, failed-run forensics |
| Facility coverage table | Virtualized `@tanstack/react-virtual` rows with state filter + CSV export |
| Per-state summary cards | Facility count, SNC count, DMR totals |
| Registry Mapping Gaps | Active `npdes_permits` rows missing `metadata.federal_npdes_id_override` |

## VA override flow (3.38)

1. Open **External Data Sync** → **Registry Mapping Gaps** (default filter: VA).
2. Pick a deferred permit from `docs/NPDES_MAPPING_CLEANUP_BACKLOG.md` (e.g. bare DMLR `1102003` or `0081742`).
3. Enter verified federal NPDES ID (EPA format, e.g. `VA0081742`).
4. Select **confirmation basis** (required for VA): VPDES PDF, VA DEQ CEDS, CD Attachment F, operator sign-off, identity match, or Other + reference.
5. Save → expect:
   - Row in `npdes_id_overrides` with `confirmation_basis`, `confirmation_reference`, `confirmed_at`, `created_by`
   - `npdes_permits.metadata.federal_npdes_id_override` updated
   - `audit_log` action `npdes_federal_mapping_saved` with actor + basis

**Hard gate (unchanged):** Do **not** run `npm run import:npdes-mappings -- --apply` against prod. One-permit manual override only.

## Manual UAT checklist (operator)

- [ ] Log in as environmental_manager or admin with `bulk_process`
- [ ] Confirm **Registry Mapping Gaps** lists VA rows without federal ID in metadata
- [ ] Map **one** VA permit with confirmation basis + reference
- [ ] Confirm gap row disappears after save (or federal column populated)
- [ ] Confirm **Audit Log** filter shows `npdes_federal_mapping_saved` with your user ID
- [ ] Confirm read-only / field_sampler sees sync buttons disabled (3.46)

## Deferred backlog (not blocking ship)

28 VA permits in `docs/NPDES_MAPPING_CLEANUP_BACKLOG.md` — map incrementally as DEQ/CEDS confirmation arrives. No bulk apply.

## Notes

- Bulk CSV import UI (`NpdesMappingImportPanel`) remains dry-run preview → selective import; does not bypass per-row confirmation for VA gaps.
- ECHO weekly cron (`sync-echo-weekly`) unchanged; full sync is manual via Sync Health panel.
