# Lane C VA/TN enrichment verification — 2026-07-01

## Scope

Shared outfall + parameter DB resolution for state lab parsers (VA/TN/AL) and `import-lab-data` safety net.

## Automated gate

```bash
npm run qa:va-tn-enrichment
```

Covers:
- `labRecordEnrichment.test.ts` — fuzzy outfall match, parameter alias + name index resolution
- Existing VA/TN/AL parse unit tests (parse-only regression)

## Code paths

| Component | Role |
|-----------|------|
| `_shared/lab-record-enrichment.ts` | `enrichLabImportRecords()` — permits → outfalls, parameter_aliases + parameters table |
| `parse-va-lab-csv` | Enrich before `markParsed` |
| `parse-osmre-monitoring` | Enrich before `markParsed` |
| `parse-al-lab-data` | Enrich before `markParsed` |
| `import-lab-data` | Re-enrich before `groupByEvent` (idempotent safety net) |

## Staging manual loop (UAT org)

**Prerequisites:** `seed-lane-a-wv-uat.sql` (permit `WV-UAT-FAKE-001`, outfalls `001`/`002`/`003`)

**Login:** `wv-uat-admin@invalid.scc.local` / `WvUat-Staging2026!`

### VA CSV sample (delimited)

```csv
Permit Number,Discharge #,Parameter,Result,Unit,Sample Date
WV-UAT-FAKE-001,001,pH,7.2,SU,01/15/2026
WV-UAT-FAKE-001,001,Iron Total,0.45,mg/L,01/15/2026
```

### TN OSMRE sheet row

Same permit/outfall/parameter values in DMR or Outfall sheet headers.

### Expected preview after parse

- `outfalls_resolved` ≥ 1 (outfall `001` → UAT outfall UUID)
- `parameters_resolved` ≥ 1 (`pH`, `Iron` via aliases / parameters table)
- `outfall_summary[].outfall_db_id` populated

### Expected after import

- `sampling_events` row for outfall × date
- `lab_results` rows with non-null `parameter_id`
- Queue status → `imported`

## Deploy

Edge Functions to redeploy after merge:

- `parse-va-lab-csv`
- `parse-osmre-monitoring`
- `parse-al-lab-data`
- `import-lab-data`
