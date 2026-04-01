# Field Visit UX — Week 1 decision lock (Phase 0)

**Status:** Locked for Stage A Week 1 (A1 weather + A2 measurements).  
**Schema:** No new tables or columns. Revisit only with explicit approval.

## Weather persistence

| Decision | Choice |
|----------|--------|
| Provider | **Open-Meteo** public forecast API (no API key; HTTPS from browser). |
| Credentials | None in repo. Optional `VITE_WEATHER_FETCH_ENABLED=false` to disable fetches (QA / air-gapped). |
| DB storage | Single existing column: `field_visits.weather_conditions` (text). |
| System vs observed | **Client-only split** while editing. On complete/sync, persist **one** string: system line + delimiter + observed line (see `formatWeatherForPersistence` in `weatherAtVisitStart.ts`). |
| Reload / edit | `observedWeatherFromPersisted()` strips the saved `Observed at site:` tail for the editable field; older rows without the delimiter load verbatim into observed. |
| Offline | No fetch when offline; user fills **Observed at site** only. |

## Field measurements vs lab

| Decision | Choice |
|----------|--------|
| Scope | Only **on-site** meter readings and field-known values. |
| Lab | **Never** entered on this screen; copy and placeholders state that lab EDD/import is downstream. |
| Required rows | Continue to derive from `stop_requirements` via `deriveRequiredFieldMeasurements` (no schema change). |

## Explicitly deferred (not Week 1)

- Photo buckets / structured evidence (R6).
- Barcode polish beyond existing `CustodyScanPanel` (A3 / Week 2).
- Second DB column for weather.
