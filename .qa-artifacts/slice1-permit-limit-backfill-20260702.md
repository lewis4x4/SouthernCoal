# Slice 1 — ECHO permit limit backfill

**Org:** `2bffc35c-e2c4-4396-868f-207f80e1e2c4`
**Before permit_limits:** 7456
**After permit_limits:** 7757
**Batches:** 8

```json
[
  {
    "limit": 50,
    "inserted": 50,
    "import_id": "d4fb4982-2097-46c7-bcec-13f62b4f42fd",
    "skipped_existing": 0
  },
  {
    "limit": 50,
    "inserted": 50,
    "import_id": "50163414-4270-4375-90b1-ca6ba92ca384",
    "skipped_existing": 0
  },
  {
    "limit": 50,
    "inserted": 50,
    "import_id": "2ac585e7-76df-4467-9a97-6e944be40db9",
    "skipped_existing": 0
  },
  {
    "limit": 50,
    "inserted": 50,
    "import_id": "26d8647f-2197-4e1f-bde0-98c5b6636251",
    "skipped_existing": 0
  },
  {
    "limit": 50,
    "inserted": 50,
    "import_id": "9a0d564e-ef34-42da-b788-a5f4f46785e0",
    "skipped_existing": 0
  },
  {
    "limit": 50,
    "inserted": 50,
    "import_id": "c766d6db-c666-44e8-bd32-1ec61612c711",
    "skipped_existing": 0
  },
  {
    "limit": 50,
    "inserted": 1,
    "import_id": "f2f2442d-5476-4f0d-b3b8-a5aaa9a0529b",
    "skipped_existing": 0
  },
  {
    "limit": 50,
    "inserted": 0,
    "import_id": "900aab21-bf10-4253-a7b6-0bf7fb583c17",
    "skipped_existing": 0
  }
]
```

Re-run `npm run qa:slice1-seed-exceedances` then `npm run qa:slice1-reconcile` after backfill.
