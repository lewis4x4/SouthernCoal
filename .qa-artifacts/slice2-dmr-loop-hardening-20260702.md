# Slice 2 — DMR loop hardening (2026-07-02)

## Go / no-go: **GO**

## Prod verification

| Check | Result |
|-------|--------|
| `calculate_dmr_values` contains `missing_unit_conversion` | ✓ |
| Half-MDL body (`20260531130000`) deployed | ✗ (gated — correct) |
| `calculation_warnings` column on `dmr_line_items` | ✓ |
| `unit_conversions` rows | 25 (was 14) |
| SYNTHETIC_UAT_SLICE2 lab (TSS 18.4 mg/L, Jan 2026) | ✓ |
| `resolve_unit_conversion('mg/L','mg/L')` | 1.0 |
| `resolve_unit_conversion('ug/L','mg/L')` | 0.001 |

## Acceptance path

1. Open `/dmr/f0001002-0002-4002-8002-000000000002` (KYGE40869 Jan 2026 synthetic submission)
2. **Auto-Populate** → TSS line should update to **18.4 mg/L** from lab data
3. **Validate** → `conversion_warnings: 0` (same units mg/L ↔ mg/L)
4. Line item `calculation_warnings` should be `[]`

## Deferrals (documented)

- **Mass/loading (lbs/day)** — not calculated; `statistical_base` covers min/avg/max/instantaneous only
- **Manual add-line-item UI** — empty state still says "add manually"; no CMS create flow
- **CMS inline edit** — `updateLineItem` still targets modern `measured_value` column; read/display works via `dmrSchema.ts`
- **Settleable solids mg/L → mL/L** — no conversion seeded; will emit `missing_unit_conversion` warning (correct behavior)

## Migration

- File: `supabase/migrations/20260703030000_slice2_dmr_loop_hardening.sql`
- Prod ledger: `slice2_dmr_loop_hardening` (via MCP + CLI query for functions/seed)
