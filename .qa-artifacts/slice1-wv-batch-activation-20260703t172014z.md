# Slice 1 WV batch activation

**Started:** 2026-07-03T17:20:14.803Z
**Finished:** 2026-07-03T17:25:39.215Z
**Status:** completed
**Org:** `2bffc35c-e2c4-4396-868f-207f80e1e2c4`
**Selection:** current `report_slice1_activation_gaps` top missing-limit permits, state prefix `WV`
**Limit:** 5

## Ranked summary

| Run rank |Top rank before |Top rank after |Permit |Missing-limit keys |Has permit_limit |Mirror keys |Pending missing_internal |Synthetic limits |Status |Chain artifact |
| --: |--: |--: |--- |--- |--- |--- |--- |--- |--- |--- |
| 1 |1 |1 |WV1022652 |36 -> 36 (0) |2974 -> 2974 (0) |15753 -> 15753 (0) |143719 -> 143719 (0) |829 -> 829 (0) |completed |.qa-artifacts/slice1-wv1022652-activation-chain-20260703.md |
| 2 |2 |2 |WV1025929 |35 -> 35 (0) |2974 -> 2974 (0) |15753 -> 15753 (0) |143719 -> 143719 (0) |829 -> 829 (0) |completed |.qa-artifacts/slice1-wv1025929-activation-chain-20260703.md |
| 3 |4 |4 |WV0091952 |24 -> 24 (0) |2974 -> 2974 (0) |15753 -> 15753 (0) |143719 -> 143719 (0) |829 -> 829 (0) |completed |.qa-artifacts/slice1-wv0091952-activation-chain-20260703.md |
| 4 |5 |5 |WV1024132 |24 -> 24 (0) |2974 -> 2974 (0) |15753 -> 15753 (0) |143719 -> 143719 (0) |829 -> 829 (0) |completed |.qa-artifacts/slice1-wv1024132-activation-chain-20260703.md |
| 5 |6 |6 |WV1021249 |18 -> 18 (0) |2974 -> 2974 (0) |15753 -> 15753 (0) |143719 -> 143719 (0) |829 -> 829 (0) |completed |.qa-artifacts/slice1-wv1021249-activation-chain-20260703.md |

## Overall deltas

| Metric |Before -> after |
| --- |--- |
| Violation keys |13312 -> 13312 (0) |
| Has permit_limit |2974 -> 2974 (0) |
| Mirror keys |15753 -> 15753 (0) |
| Pending missing_internal |143719 -> 143719 (0) |
| SYNTHETIC ECHO limits |829 -> 829 (0) |

## Today's skipped chain artifacts

KYGE40869, WV1006304, WV1018736, WV1018779, WV1018965, WV1021079, WV1021338, WV1022580, WV1026488

## Commands run

```bash
npm run qa:slice1-activation-chain -- --permit WV1022652 --exceedance-limit 50 --exceedance-batches 20 --repair-limit 50 --repair-batches 10 --reconcile-limit 10000 --reconcile-batches 10 --detect-wait 20
npm run qa:slice1-activation-chain -- --permit WV1025929 --exceedance-limit 50 --exceedance-batches 20 --repair-limit 50 --repair-batches 10 --reconcile-limit 10000 --reconcile-batches 10 --detect-wait 20
npm run qa:slice1-activation-chain -- --permit WV0091952 --exceedance-limit 50 --exceedance-batches 20 --repair-limit 50 --repair-batches 10 --reconcile-limit 10000 --reconcile-batches 10 --detect-wait 20
npm run qa:slice1-activation-chain -- --permit WV1024132 --exceedance-limit 50 --exceedance-batches 20 --repair-limit 50 --repair-batches 10 --reconcile-limit 10000 --reconcile-batches 10 --detect-wait 20
npm run qa:slice1-activation-chain -- --permit WV1021249 --exceedance-limit 50 --exceedance-batches 20 --repair-limit 50 --repair-batches 10 --reconcile-limit 10000 --reconcile-batches 10 --detect-wait 20
```

## Failures

_None_

## Initial gap report

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

## Final gap report

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
