# Slice 1 — activation gap report

**Org:** `2bffc35c-e2c4-4396-868f-207f80e1e2c4`  
**Generated:** 2026-07-02T23:00:28.589Z

## Funnel (distinct npdes:outfall:parameter keys)

| Stage | Count |
|-------|------:|
| Violation keys | 13199 |
| Has permit | 8816 |
| Has outfall | 4365 |
| Has parameter | 3442 |
| Has permit_limit | 2441 |

## Backlog

| Metric | Count |
|--------|------:|
| `slice1_echo_mirror_keys` | 15179 |
| Pending `missing_internal` | 144649 |
| Permits without federal override | 32 |

## Interpretation

- **Mirror seeding exhausted** when `mirror_keys ≈ has_permit_limit` distinct keys — remaining pending rows are monthly ECHO violations without resolvable permit limits or internal graph.
- **Shrink pending** by uploading permits + limits via Upload Dashboard, mapping VA federal IDs (Slice 6), then re-run `npm run qa:slice1-seed-exceedances` + `npm run qa:slice1-reconcile`.

## Top permits missing limits (outfall + parameter matched, no limit row)

| permit_number | npdes_id | missing_limit_keys |
| --- | --- | --- |
| KYGE40869 | KYGE40869 | 144 |
| WV1018965 | WV1018965 | 63 |
| WV1021079 | WV1021079 | 55 |
| WV1026488 | WV1026488 | 51 |
| WV1021338 | WV1021338 | 48 |
| WV1022580 | WV1022580 | 48 |
| WV1018736 | WV1018736 | 42 |
| WV1018779 | WV1018779 | 39 |
| WV1006304 | WV1006304 | 38 |
| WV1022652 | WV1022652 | 36 |

## Raw JSON

```json
{
  "funnel": {
    "has_permit": 8816,
    "has_outfall": 4365,
    "has_parameter": 3442,
    "has_permit_limit": 2441,
    "distinct_violation_keys": 13199
  },
  "mirror_keys": 15179,
  "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
  "pending_missing_internal": 144649,
  "top_permits_missing_limits": [
    {
      "npdes_id": "KYGE40869",
      "permit_number": "KYGE40869",
      "missing_limit_keys": 144
    },
    {
      "npdes_id": "WV1018965",
      "permit_number": "WV1018965",
      "missing_limit_keys": 63
    },
    {
      "npdes_id": "WV1021079",
      "permit_number": "WV1021079",
      "missing_limit_keys": 55
    },
    {
      "npdes_id": "WV1026488",
      "permit_number": "WV1026488",
      "missing_limit_keys": 51
    },
    {
      "npdes_id": "WV1021338",
      "permit_number": "WV1021338",
      "missing_limit_keys": 48
    },
    {
      "npdes_id": "WV1022580",
      "permit_number": "WV1022580",
      "missing_limit_keys": 48
    },
    {
      "npdes_id": "WV1018736",
      "permit_number": "WV1018736",
      "missing_limit_keys": 42
    },
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
    }
  ],
  "permits_without_federal_override": 32
}
```
