# April 15 Cutover Rehearsal Checklist

## Inputs
- Export the starter matrix from `/admin/cutover` or use `docs/april-15-cutover-matrix-template.csv`.
- Prepare one matrix per state or one combined matrix.
- Every row must end with one disposition:
  - `live`
  - `archive`
  - `exclude`

## Recommended row data
- `state_code`
- `site_name`
- `permit_number`
- `outfall_number` when finer control is needed
- `external_npdes_id` if it helps matching
- `mine_id` for MSHA-linked archive scope
- `notes`

## Rehearsal Sequence
1. Create a draft cutover batch in `/admin/cutover`.
2. Upload the state matrices.
3. Run preview.
4. Resolve every `unresolved` and `ambiguous` row.
5. Confirm:
   - live roster site count
   - archive preview counts
   - live-after-preview counts
6. Execute cutover.
7. Verify:
   - executive dashboard counts
   - financial risk card
   - operational status card
   - FTS pages
   - compliance violations pages
   - archive manifest
   - archive table previews
8. Run restore preview in `/admin/archive`.

## Rehearsal Acceptance
- No unresolved rows remain.
- No ambiguous rows remain.
- Active facilities match intended live roster.
- Archived historical penalties and violations disappear from live mode.
- Archive mode still shows those records.
- Compliance snapshot regenerates successfully after execution.
