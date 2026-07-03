# Slice 1 phase 3 — WV1022580 activation chain

**Started:** 2026-07-03T14:49:32.252Z  
**Finished:** 2026-07-03T14:50:29.907Z  
**Org:** `2bffc35c-e2c4-4396-868f-207f80e1e2c4`

## Acceptance checks

| Check | Result |
|-------|--------|
| `has_permit_limit` increased | 0 (2851 → 2851) |
| Pending `missing_internal` dropped | 143769 → 143601 (Δ -168) |
| WV1022580 off top gap list | WV1022580 was not on top gap list before or after |
| Scoped detect | Ran slice3-echo-batch-detect --permit WV1022580 |

## Funnel (before → after)

| Stage | Before | After | Δ |
|-------|-------:|------:|--:|
| Violation keys | 13200 | 13200 | 0 |
| Has permit_limit | 2851 | 2851 | 0 |
| Mirror keys | 15555 | 15611 | 56 |

## Commands run

```bash
npm run qa:slice1-activation-gaps -- --suffix before
npm run qa:slice1-seed-exceedances -- --limit 50 --batches 20 --permit WV1022580
npm run qa:slice1-repair-stuck-keys -- --limit 50 --batches 10 --permit WV1022580
npm run qa:slice1-reconcile -- --limit 10000 --batches 10
npm run qa:slice1-activation-gaps -- --suffix after
npm run qa:slice3-echo-batch-detect -- --permit WV1022580 --wait 20
```

## Raw gap reports

<details><summary>Before</summary>

```json
{
  "funnel": {
    "no_permit": 4383,
    "has_permit": 8817,
    "has_outfall": 4366,
    "has_parameter": 3443,
    "has_permit_limit": 2851,
    "distinct_violation_keys": 13200
  },
  "mirror_keys": 15555,
  "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
  "synthetic_echo_limits": 710,
  "pending_missing_internal": 143769,
  "top_permits_missing_limits": [
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
    "has_permit": 8817,
    "has_outfall": 4366,
    "has_parameter": 3443,
    "has_permit_limit": 2851,
    "distinct_violation_keys": 13200
  },
  "mirror_keys": 15611,
  "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
  "synthetic_echo_limits": 710,
  "pending_missing_internal": 143601,
  "top_permits_missing_limits": [
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
    }
  ],
  "permits_without_federal_override": 32
}
```

</details>
