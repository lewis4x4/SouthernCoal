# VA NPDES Override Candidate Pack

**Generated:** 2026-07-04
**Import posture:** 0 rows are import-ready by default. This pack is for selective review.

## Inputs

- `.qa-artifacts/slice6-va-npdes-override-20260702.md`
- `.qa-artifacts/echo-reconciliation-closeout-20260703.md`
- `.qa-artifacts/slice1-activation-gaps-20260703-after.md`
- `docs/NPDES_MAPPING_CLEANUP_BACKLOG.md`
- `../SOUTHERN COAL/SCC_Federal_NPDES_Mapping_GAPS.md`

## Counts

- Total unresolved federal-ID rows covered: 32
- VA rows: 28
- WV/data-quality rows: 4
- Rows with proposed NPDES IDs: 30
- Rows safe for immediate import: 0

## Confirmation Loop

1. Open the CSV and review one row against the named source.
2. Replace the TODO confirmation_reference with the actual CEDS, VPDES PDF, CD Attachment F, or operator/DEQ citation.
3. Change confidence to CONFIRMED or IDENTITY only for that reviewed row.
4. Upload the edited CSV in External Data Sync -> Bulk NPDES crosswalk import.
5. Preview must show only the promoted rows as ready to import; unpromoted CANDIDATE/PROXIMITY/BLOCKED rows remain skipped.

Do not use `npm run import:npdes-mappings -- --apply` for this pack.

## Allowed Confirmation Basis Values

- `vpdes_pdf`
- `va_deq_ceds`
- `cd_attachment_f`
- `operator_deq_signoff`
- `identity_match`
- `other`

## Candidate Rows

| permit_number | npdes_id | state | confidence | basis | review_status | category | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0081742 | VA0081742 | VA | CANDIDATE | va_deq_ceds | needs_state_conflation_review | va_bare_008_series | Candidate is prefix restoration only. The May gap report left the federal ID blank pending VPDES PDF or VA DEQ CEDS confirmation. |
| 0081800 | VA0081800 | VA | CANDIDATE | va_deq_ceds | needs_vpdes_confirmation | va_bare_008_series | Candidate is prefix restoration only. The May gap report left the federal ID blank pending VPDES PDF or VA DEQ CEDS confirmation. |
| 0081918 | VA0081918 | VA | CANDIDATE | va_deq_ceds | needs_twin_dedupe_confirmation | va_bare_008_series | Candidate is prefix restoration only. The May gap report left the federal ID blank pending VPDES PDF or VA DEQ CEDS confirmation. |
| 0081954 | VA0081954 | VA | CANDIDATE | va_deq_ceds | needs_twin_dedupe_confirmation | va_bare_008_series | Candidate is prefix restoration only. The May gap report left the federal ID blank pending VPDES PDF or VA DEQ CEDS confirmation. |
| 0081975 | VA0081975 | VA | CANDIDATE | va_deq_ceds | needs_vpdes_confirmation | va_bare_008_series | Candidate is prefix restoration only. The May gap report left the federal ID blank pending VPDES PDF or VA DEQ CEDS confirmation. |
| 0082052 | VA0082052 | VA | CANDIDATE | va_deq_ceds | needs_vpdes_confirmation | va_bare_008_series | Candidate is prefix restoration only. The May gap report left the federal ID blank pending VPDES PDF or VA DEQ CEDS confirmation. |
| 0082053 | VA0082053 | VA | CANDIDATE | va_deq_ceds | needs_vpdes_confirmation | va_bare_008_series | Candidate is prefix restoration only. The May gap report left the federal ID blank pending VPDES PDF or VA DEQ CEDS confirmation. |
| 0082071 | VA0082071 | VA | CANDIDATE | va_deq_ceds | needs_twin_dedupe_confirmation | va_bare_008_series | Candidate is prefix restoration only. The May gap report left the federal ID blank pending VPDES PDF or VA DEQ CEDS confirmation. |
| 0082094 | VA0082094 | VA | CANDIDATE | va_deq_ceds | needs_vpdes_confirmation | va_bare_008_series | Candidate is prefix restoration only. The May gap report left the federal ID blank pending VPDES PDF or VA DEQ CEDS confirmation. |
| 1102003 | VA0082003 | VA | CANDIDATE | cd_attachment_f | needs_dmlr_pairing_confirmation | va_bare_dmlr | Proposed from the observed VA SMCRA to VPDES digit pattern. Do not promote without a source row pairing the DMLR permit to the federal VPDES ID. |
| 1602068 | VA0082068 | VA | CANDIDATE | cd_attachment_f | needs_dmlr_pairing_confirmation | va_bare_dmlr | Proposed from the observed VA SMCRA to VPDES digit pattern. Do not promote without a source row pairing the DMLR permit to the federal VPDES ID. |
| VA0081554 | VA0081554 | VA | CANDIDATE | operator_deq_signoff | needs_identity_confirmation | va_valid_format_unconfirmed | Permit number is already valid federal VPDES format, but local evidence did not confirm it in CD Attachment F Q1-Q3 or ECHO. Promote only after operator, DEQ, CEDS, or permit PDF confirmation. |
| VA0081916 | VA0081916 | VA | CANDIDATE | operator_deq_signoff | needs_identity_confirmation | va_valid_format_unconfirmed | Permit number is already valid federal VPDES format, but local evidence did not confirm it in CD Attachment F Q1-Q3 or ECHO. Promote only after operator, DEQ, CEDS, or permit PDF confirmation. |
| VA0081917 | VA0081917 | VA | CANDIDATE | operator_deq_signoff | needs_identity_confirmation | va_valid_format_unconfirmed | Permit number is already valid federal VPDES format, but local evidence did not confirm it in CD Attachment F Q1-Q3 or ECHO. Promote only after operator, DEQ, CEDS, or permit PDF confirmation. |
| VA0081918 | VA0081918 | VA | CANDIDATE | operator_deq_signoff | needs_twin_dedupe_confirmation | va_valid_format_unconfirmed | Permit number is already valid federal VPDES format, but local evidence did not confirm it in CD Attachment F Q1-Q3 or ECHO. Promote only after operator, DEQ, CEDS, or permit PDF confirmation. |
| VA0081949 | VA0081949 | VA | CANDIDATE | operator_deq_signoff | needs_identity_confirmation | va_valid_format_unconfirmed | Permit number is already valid federal VPDES format, but local evidence did not confirm it in CD Attachment F Q1-Q3 or ECHO. Promote only after operator, DEQ, CEDS, or permit PDF confirmation. |
| VA0081954 | VA0081954 | VA | CANDIDATE | operator_deq_signoff | needs_twin_dedupe_confirmation | va_valid_format_unconfirmed | Permit number is already valid federal VPDES format, but local evidence did not confirm it in CD Attachment F Q1-Q3 or ECHO. Promote only after operator, DEQ, CEDS, or permit PDF confirmation. |
| VA0081991 | VA0081991 | VA | CANDIDATE | operator_deq_signoff | needs_identity_confirmation | va_valid_format_unconfirmed | Permit number is already valid federal VPDES format, but local evidence did not confirm it in CD Attachment F Q1-Q3 or ECHO. Promote only after operator, DEQ, CEDS, or permit PDF confirmation. |
| VA0082042 | VA0082042 | VA | CANDIDATE | operator_deq_signoff | needs_identity_confirmation | va_valid_format_unconfirmed | Permit number is already valid federal VPDES format, but local evidence did not confirm it in CD Attachment F Q1-Q3 or ECHO. Promote only after operator, DEQ, CEDS, or permit PDF confirmation. |
| VA0082047 | VA0082047 | VA | CANDIDATE | operator_deq_signoff | needs_identity_confirmation | va_valid_format_unconfirmed | Permit number is already valid federal VPDES format, but local evidence did not confirm it in CD Attachment F Q1-Q3 or ECHO. Promote only after operator, DEQ, CEDS, or permit PDF confirmation. |
| VA0082051 | VA0082051 | VA | CANDIDATE | operator_deq_signoff | needs_identity_confirmation | va_valid_format_unconfirmed | Permit number is already valid federal VPDES format, but local evidence did not confirm it in CD Attachment F Q1-Q3 or ECHO. Promote only after operator, DEQ, CEDS, or permit PDF confirmation. |
| VA0082054 | VA0082054 | VA | CANDIDATE | operator_deq_signoff | needs_identity_confirmation | va_valid_format_unconfirmed | Permit number is already valid federal VPDES format, but local evidence did not confirm it in CD Attachment F Q1-Q3 or ECHO. Promote only after operator, DEQ, CEDS, or permit PDF confirmation. |
| VA0082066 | VA0082066 | VA | CANDIDATE | operator_deq_signoff | needs_identity_confirmation | va_valid_format_unconfirmed | Permit number is already valid federal VPDES format, but local evidence did not confirm it in CD Attachment F Q1-Q3 or ECHO. Promote only after operator, DEQ, CEDS, or permit PDF confirmation. |
| VA0082071 | VA0082071 | VA | CANDIDATE | operator_deq_signoff | needs_twin_dedupe_confirmation | va_valid_format_unconfirmed | Permit number is already valid federal VPDES format, but local evidence did not confirm it in CD Attachment F Q1-Q3 or ECHO. Promote only after operator, DEQ, CEDS, or permit PDF confirmation. |
| VA0082074 | VA0082074 | VA | CANDIDATE | operator_deq_signoff | needs_identity_confirmation | va_valid_format_unconfirmed | Permit number is already valid federal VPDES format, but local evidence did not confirm it in CD Attachment F Q1-Q3 or ECHO. Promote only after operator, DEQ, CEDS, or permit PDF confirmation. |
| VA0082058 | TBD | VA | BLOCKED | vpdes_pdf | blocked_false_positive | va_false_positive | Do not map to VA0082058. The May gap report says the ECHO hit is Washington District Elementary, not an SCC coal facility. |
| VA1101916 | VA0081916 | VA | CANDIDATE | va_deq_ceds | needs_dmlr_pairing_and_dedupe | va_pseudo_npdes | VA1101916 is a rejected pseudo-NPDES value. VA0081916 is only a candidate inferred from the DMLR digit pattern and duplicate registry context. |
| VA0081914 | VA0081914 | VA | PROXIMITY | cd_attachment_f | needs_primary_attachment_f_confirmation | va_proximity_held | Held at PROXIMITY because the primary Q4 2025 Attachment F PDF was not in local folders when the May gap report was prepared. |
| WV0081742 | VA0081742 | WV | CANDIDATE | va_deq_ceds | needs_va_wv_conflation_resolution | wv_va_state_conflict | Registry contains a WV-prefixed row and a VA bare 0081742 row with the same core. Proposed VA0081742 is only for review after state ownership is resolved. |
| 1102042 | VA0082042 | WV | CANDIDATE | va_deq_ceds | needs_registry_state_resolution | wv_va_state_conflict | Registry says WV DEP, but Lawson operations list places this in VA Outfalls. Proposed VA0082042 is only for review after state/source reconciliation. |
| 1102051 | VA0082051 | WV | CANDIDATE | va_deq_ceds | needs_registry_state_resolution | wv_va_state_conflict | Registry says WV DEP, but Lawson operations list places this in VA Outfalls. Proposed VA0082051 is only for review after state/source reconciliation. |
| WV-UAT-FAKE-001 | TBD | WV | DELETE_ROW | TBD | delete_test_fixture | wv_test_fixture | Not a mapping candidate. The May gap report identifies this as a UAT/test fixture row and recommends deleting it from npdes_permits. |
