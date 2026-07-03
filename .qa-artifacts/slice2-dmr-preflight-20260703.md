# Slice 2 — DMR calculate + mass loading preflight

**Submission:** `f0001002-0002-4002-8002-000000000002` (KYGE40869 Jan 2026 synthetic)

## calculate_dmr_values result

```json
{
  "status": "calculated",
  "missing": 302,
  "populated": 2,
  "line_count": 304,
  "exceedances": 1,
  "conversion_warnings": 1
}
```

## apply_dmr_mass_loading_for_submission

- **Rows updated:** 1
- **Expected mass loading (TSS line):** 383.64 lbs/day (18.4 mg/L × 2.5 MGD × 8.34)

## TSS line item

```json
{
  "id": "f0001003-0003-4003-8003-000000000003",
  "concentration_max": 18.4,
  "concentration_units": "lbs/day",
  "calculation_warnings": [
    {
      "type": "missing_unit_conversion",
      "message": "No unit conversion from mg/L to lbs/day for Total Suspended Solids — raw lab value retained",
      "to_unit": "lbs/day",
      "from_unit": "mg/L",
      "parameter_id": "d1ee9a87-5fcc-4c5a-95a0-b26b3ba228cb"
    },
    {
      "type": "mass_loading_calculated",
      "message": "Mass loading 383.6400 lbs/day from 18.4000 mg/L × 2.5000 MGD",
      "flow_mgd": 2.5
    }
  ],
  "mass_loading_lbs_day": 383.64,
  "quantity_max": 383.64
}
```

**Calc pass:** yes
**Mass loading pass:** yes
**Pass:** yes
