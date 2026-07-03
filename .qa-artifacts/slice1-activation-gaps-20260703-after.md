# Slice 1 — activation gap report

**Org:** `2bffc35c-e2c4-4396-868f-207f80e1e2c4`  
**Generated:** 2026-07-03T14:51:09.903Z

## Funnel (distinct npdes:outfall:parameter keys)

| Stage | Count |
|-------|------:|
| Violation keys | 13200 |
| No registry permit | 4383 |
| Has permit | 8817 |
| Has outfall | 4366 |
| Has parameter | 3443 |
| Has permit_limit | 2893 |

## Backlog

| Metric | Count |
|--------|------:|
| `slice1_echo_mirror_keys` | 15667 |
| Pending `missing_internal` | 143433 |
| Permits without federal override | 32 |
| SYNTHETIC ECHO limits | 752 |

## Interpretation

- **Mirror seeding exhausted** when `mirror_keys ≈ has_permit_limit` distinct keys — remaining pending rows are monthly ECHO violations without resolvable permit limits or internal graph.
- **Shrink pending** by uploading permits + limits via Upload Dashboard, mapping VA federal IDs (Slice 6), then re-run `npm run qa:slice1-seed-exceedances` + `npm run qa:slice1-reconcile`.

## Top permits missing limits (outfall + parameter matched, no limit row)

| permit_number | npdes_id | missing_limit_keys |
| --- | --- | --- |
| WV1018779 | WV1018779 | 39 |
| WV1006304 | WV1006304 | 38 |
| WV1022652 | WV1022652 | 36 |
| WV1025929 | WV1025929 | 35 |
| KYGE40999 | KYGE40999 | 24 |
| WV0091952 | WV0091952 | 24 |
| WV1024132 | WV1024132 | 24 |
| WV1021249 | WV1021249 | 18 |
| WV1025911 | WV1025911 | 18 |
| WV1021061 | WV1021061 | 17 |

## Raw JSON

```json
{
  "funnel": {
    "no_permit": 4383,
    "has_permit": 8817,
    "has_outfall": 4366,
    "has_parameter": 3443,
    "has_permit_limit": 2893,
    "distinct_violation_keys": 13200
  },
  "mirror_keys": 15667,
  "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
  "synthetic_echo_limits": 752,
  "pending_missing_internal": 143433,
  "top_permits_missing_limits": [
    {
      "npdes_id": "WV1018779",
      "permit_number": "WV1018779",
      "missing_limit_keys": 39
    },
    {
      "npdes_id": "WV1006304",
      "permit_number": "WV1006304",
      "missing_limit_keys": 38
    },
    {
      "npdes_id": "WV1022652",
      "permit_number": "WV1022652",
      "missing_limit_keys": 36
    },
    {
      "npdes_id": "WV1025929",
      "permit_number": "WV1025929",
      "missing_limit_keys": 35
    },
    {
      "npdes_id": "KYGE40999",
      "permit_number": "KYGE40999",
      "missing_limit_keys": 24
    },
    {
      "npdes_id": "WV0091952",
      "permit_number": "WV0091952",
      "missing_limit_keys": 24
    },
    {
      "npdes_id": "WV1024132",
      "permit_number": "WV1024132",
      "missing_limit_keys": 24
    },
    {
      "npdes_id": "WV1021249",
      "permit_number": "WV1021249",
      "missing_limit_keys": 18
    },
    {
      "npdes_id": "WV1025911",
      "permit_number": "WV1025911",
      "missing_limit_keys": 18
    },
    {
      "npdes_id": "WV1021061",
      "permit_number": "WV1021061",
      "missing_limit_keys": 17
    },
    {
      "npdes_id": "KY0106151",
      "permit_number": "KY0106151",
      "missing_limit_keys": 16
    },
    {
      "npdes_id": "WV0052531",
      "permit_number": "WV0052531",
      "missing_limit_keys": 15
    },
    {
      "npdes_id": "WV1005481",
      "permit_number": "WV1005481",
      "missing_limit_keys": 12
    },
    {
      "npdes_id": "WV1026003",
      "permit_number": "WV1026003",
      "missing_limit_keys": 12
    },
    {
      "npdes_id": "WV1027913",
      "permit_number": "WV1027913",
      "missing_limit_keys": 12
    },
    {
      "npdes_id": "WV1021095",
      "permit_number": "WV1021095",
      "missing_limit_keys": 11
    },
    {
      "npdes_id": "WV1027891",
      "permit_number": "WV1027891",
      "missing_limit_keys": 10
    },
    {
      "npdes_id": "KYGE40840",
      "permit_number": "KYGE40840",
      "missing_limit_keys": 9
    },
    {
      "npdes_id": "WV0065048",
      "permit_number": "WV0065048",
      "missing_limit_keys": 9
    },
    {
      "npdes_id": "WV1005944",
      "permit_number": "WV1005944",
      "missing_limit_keys": 9
    },
    {
      "npdes_id": "WV1018698",
      "permit_number": "WV1018698",
      "missing_limit_keys": 9
    },
    {
      "npdes_id": "WV1021281",
      "permit_number": "WV1021281",
      "missing_limit_keys": 9
    },
    {
      "npdes_id": "WV1023781",
      "permit_number": "WV1023781",
      "missing_limit_keys": 9
    },
    {
      "npdes_id": "WV1024159",
      "permit_number": "WV1024159",
      "missing_limit_keys": 9
    },
    {
      "npdes_id": "WV1018833",
      "permit_number": "WV1018833",
      "missing_limit_keys": 8
    }
  ],
  "permits_without_federal_override": 32
}
```
