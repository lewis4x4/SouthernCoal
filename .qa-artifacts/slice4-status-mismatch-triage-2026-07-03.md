# Slice 4 — status_mismatch triage export

**Date:** 2026-07-03
**Pending rows:** 111
**Critical:** 70

## Pattern

All rows are **permit status** mismatches: internal `npdes_permits.status = active` vs ECHO facility status.

| ECHO status | Count |
|-------------|------:|
| Expired | 38 |
| Effective | 34 |
| Terminated; Compliance Tracking Off | 21 |
| Admin Continued | 17 |
| Expired; Compliance Tracking Off | 1 |

## Action

Review in **Review Queue** → filter **Type: Status Mismatch**. For each permit decide:

1. Update internal permit status to match ECHO (if SCC confirms termination/expiry), or
2. Dismiss with notes if internal `active` is correct (renewal pending, ECHO lag).

**Do not bulk-mark reviewed** — these are permit lifecycle decisions, not detection noise.

## Sample (first 10)

```json
[
  {
    "id": "1cb74e21-31ff-48aa-bdc0-adf386cc754a",
    "npdes_id": "AL0062693",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Admin Continued\"",
    "internal_value": "active",
    "external_value": "Admin Continued",
    "detected_at": "2026-07-02T22:26:13.150073+00:00"
  },
  {
    "id": "aa9b670d-02e1-4f60-8bd9-207949b19ab6",
    "npdes_id": "AL0062693",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Admin Continued\"",
    "internal_value": "active",
    "external_value": "Admin Continued",
    "detected_at": "2026-07-02T22:25:19.29538+00:00"
  },
  {
    "id": "23dc05b8-671d-4128-80da-58269b3481b8",
    "npdes_id": "AL0072991",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Terminated; Compliance Tracking Off\"",
    "internal_value": "active",
    "external_value": "Terminated; Compliance Tracking Off",
    "detected_at": "2026-07-02T22:26:29.284889+00:00"
  },
  {
    "id": "60d43ecf-28f4-4507-9168-f3eec61c2a09",
    "npdes_id": "AL0073920",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Terminated; Compliance Tracking Off\"",
    "internal_value": "active",
    "external_value": "Terminated; Compliance Tracking Off",
    "detected_at": "2026-07-02T22:26:34.478306+00:00"
  },
  {
    "id": "d9028aa9-2c56-4006-b0d9-559cff75b600",
    "npdes_id": "AL0073962",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Effective\"",
    "internal_value": "active",
    "external_value": "Effective",
    "detected_at": "2026-07-02T22:26:56.704573+00:00"
  },
  {
    "id": "2a67e30b-8b3b-474f-b957-b74175e5489a",
    "npdes_id": "AL0078026",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Terminated; Compliance Tracking Off\"",
    "internal_value": "active",
    "external_value": "Terminated; Compliance Tracking Off",
    "detected_at": "2026-07-02T22:27:13.278243+00:00"
  },
  {
    "id": "2d8a2d08-d7e2-41a4-b817-5aa9b24d3ea9",
    "npdes_id": "AL0078867",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Admin Continued\"",
    "internal_value": "active",
    "external_value": "Admin Continued",
    "detected_at": "2026-07-02T22:27:16.357282+00:00"
  },
  {
    "id": "f0ca5285-b2d5-4ada-bf9c-f8ed6a9f5648",
    "npdes_id": "AL0080071",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Effective\"",
    "internal_value": "active",
    "external_value": "Effective",
    "detected_at": "2026-07-02T22:27:19.559968+00:00"
  },
  {
    "id": "c2067974-54c3-484f-93c7-09e0637cffe7",
    "npdes_id": "KY0094510",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Effective\"",
    "internal_value": "active",
    "external_value": "Effective",
    "detected_at": "2026-07-02T22:47:35.946973+00:00"
  },
  {
    "id": "d15e338a-022f-466b-8dc1-b87358591e2d",
    "npdes_id": "KY0094510",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Effective\"",
    "internal_value": "active",
    "external_value": "Effective",
    "detected_at": "2026-07-02T22:27:22.430878+00:00"
  }
]
```
