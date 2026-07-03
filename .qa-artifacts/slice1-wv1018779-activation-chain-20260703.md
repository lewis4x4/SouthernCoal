# Slice 1 phase 3 — WV1018779 activation chain

**Started:** 2026-07-03T15:02:23.725Z  
**Finished:** 2026-07-03T15:03:20.442Z  
**Org:** `2bffc35c-e2c4-4396-868f-207f80e1e2c4`

## Acceptance checks

| Check | Result |
|-------|--------|
| `has_permit_limit` increased | 0 (2932 → 2932) |
| Pending `missing_internal` dropped | 143433 → 143295 (Δ -138) |
| WV1018779 off top gap list | WV1018779 was not on top gap list before or after |
| Scoped detect | Ran slice3-echo-batch-detect --permit WV1018779 |

## Funnel (before → after)

| Stage | Before | After | Δ |
|-------|-------:|------:|--:|
| Violation keys | 13200 | 13200 | 0 |
| Has permit_limit | 2932 | 2932 | 0 |
| Mirror keys | 15667 | 15713 | 46 |

## Commands run

```bash
npm run qa:slice1-activation-gaps -- --suffix before
npm run qa:slice1-seed-exceedances -- --limit 50 --batches 20 --permit WV1018779
npm run qa:slice1-repair-stuck-keys -- --limit 50 --batches 10 --permit WV1018779
npm run qa:slice1-reconcile -- --limit 10000 --batches 10
npm run qa:slice1-activation-gaps -- --suffix after
npm run qa:slice3-echo-batch-detect -- --permit WV1018779 --wait 20
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
    "has_permit_limit": 2932,
    "distinct_violation_keys": 13200
  },
  "mirror_keys": 15667,
  "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
  "synthetic_echo_limits": 791,
  "pending_missing_internal": 143433,
  "top_permits_missing_limits": [
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
    },
    {
      "npdes_id": "KY0094510",
      "permit_number": "KY0094510",
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
    "has_permit": 8817,
    "has_outfall": 4366,
    "has_parameter": 3443,
    "has_permit_limit": 2932,
    "distinct_violation_keys": 13200
  },
  "mirror_keys": 15713,
  "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
  "synthetic_echo_limits": 791,
  "pending_missing_internal": 143295,
  "top_permits_missing_limits": [
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
    },
    {
      "npdes_id": "KY0094510",
      "permit_number": "KY0094510",
      "missing_limit_keys": 7
    }
  ],
  "permits_without_federal_override": 32
}
```

</details>
