# Lane C QW4 — Overdue field gear PM verification (2026-07-01)

**Spec:** `docs/QUICK_WINS.md` §QW4, `docs/UNIFIED_MASTER_ROADMAP.md` §3  
**Route:** `/admin/equipment` → **Overdue Gear** tab  
**Automated gate:** `npm run qa:qw4` — pass (1 test)

## Already shipped (migration `20260701140000`)

| Layer | Artifact |
|-------|----------|
| DB | `get_equipment_due_maintenance()` RPC + `idx_maintenance_logs_due` |
| UI | `EquipmentAdminPage` — inventory, calibration due, overdue gear tabs |
| Hook | `useEquipment` calls RPC with 14-day window |
| RBAC | `/admin/equipment` — `EQUIPMENT_ADMIN_ROLES` |

## Activation slice (this session)

| Step | Result |
|------|--------|
| UAT seed | `scripts/seed-qw4-uat-equipment-pm.sql` — 3 assets, 3 PM logs, 1 assignment |
| RPC window | Default `p_within_days = 14` |
| Prod verify | **2 rows** in PM-due query (cooler excluded at +60d) |

### Seeded gear (UAT org `f0000001…`)

| Asset | PM due | Days | In list? |
|-------|--------|------|----------|
| UAT pH Meter (QW4 overdue) | 2026-06-21 | **−10** | Yes — overdue |
| UAT GPS Handheld (QW4 due soon) | 2026-07-06 | **+5** | Yes — due soon |
| UAT Sample Cooler (QW4 current) | 2026-08-30 | +60 | No — outside window |

The overdue pH meter is also assigned to `wv-uat-sampler` and may appear on the **Calibration Due** tab (requires calibration, no cal log yet).

## Manual smoke

1. Log in as `wv-uat-admin@invalid.scc.local` on Netlify.
2. Open `/admin/equipment` — red banner: **1** overdue for maintenance.
3. **Overdue Gear** tab — 2 rows (10d overdue + 5d remaining).
4. **Inventory** tab — 3 QW4 assets listed.

## Empty-state behavior (production SCC)

`equipment_catalog` / `maintenance_logs` are empty for live SCC orgs until gear is registered — page shows green empty-state copy. Advisory PM list only; not heavy-equipment CMMS.

## Next (Lane C)

**QW3** — Defensible-miss packet generator (counsel-facing export).
