# Slice 1 phase 3 — WV0091952 activation chain

**Started:** 2026-07-03T17:22:29.571Z
**Finished:** 2026-07-03T17:23:25.300Z
**Org:** `2bffc35c-e2c4-4396-868f-207f80e1e2c4`

## Acceptance checks

| Check | Result |
|-------|--------|
| `has_permit_limit` increased | 0 (2974 → 2974) |
| Pending `missing_internal` dropped | 143719 → 143719 (Δ 0) |
| WV0091952 off top gap list | No — WV0091952 still ranked #4 |
| Scoped detect | Ran slice3-echo-batch-detect --permit WV0091952 |

## Funnel (before → after)

| Stage | Before | After | Δ |
|-------|-------:|------:|--:|
| Violation keys | 13312 | 13312 | 0 |
| Has permit_limit | 2974 | 2974 | 0 |
| Mirror keys | 15753 | 15753 | 0 |

## Commands run

```bash
npm run qa:slice1-activation-gaps -- --suffix before
npm run qa:slice1-seed-exceedances -- --limit 50 --batches 20 --permit WV0091952
npm run qa:slice1-repair-stuck-keys -- --limit 50 --batches 10 --permit WV0091952
npm run qa:slice1-reconcile -- --limit 10000 --batches 10
npm run qa:slice1-activation-gaps -- --suffix after
npm run qa:slice3-echo-batch-detect -- --permit WV0091952 --wait 20
```

## Raw gap reports

<details><summary>Before</summary>

```json
{
  "funnel": {
    "no_permit": 4383,
    "has_permit": 8929,
    "has_outfall": 4372,
    "has_parameter": 3449,
    "has_permit_limit": 2974,
    "distinct_violation_keys": 13312
  },
  "mirror_keys": 15753,
  "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
  "synthetic_echo_limits": 829,
  "pending_missing_internal": 143719,
  "top_permits_missing_limits": [
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
    },
    {
      "npdes_id": "KY0094510",
      "permit_number": "KY0094510",
      "missing_limit_keys": 7
    },
    {
      "npdes_id": "WV1021117",
      "permit_number": "WV1021117",
      "missing_limit_keys": 7
    }
  ],
  "permits_without_federal_override": 32
}
```

</details>

<details><summary>After</summary>

```json
{
  "funnel": {
    "no_permit": 4383,
    "has_permit": 8929,
    "has_outfall": 4372,
    "has_parameter": 3449,
    "has_permit_limit": 2974,
    "distinct_violation_keys": 13312
  },
  "mirror_keys": 15753,
  "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
  "synthetic_echo_limits": 829,
  "pending_missing_internal": 143719,
  "top_permits_missing_limits": [
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
    },
    {
      "npdes_id": "KY0094510",
      "permit_number": "KY0094510",
      "missing_limit_keys": 7
    },
    {
      "npdes_id": "WV1021117",
      "permit_number": "WV1021117",
      "missing_limit_keys": 7
    }
  ],
  "permits_without_federal_override": 32
}
```

</details>
