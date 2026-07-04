# Slice 4 — status_mismatch triage export

**Date:** 2026-07-03
**Mode:** Dry run only
**Pending rows before:** 82
**Safe dismiss-with-note candidates before:** 0
**Safe dismisses applied:** 0
**Safe semantic rows dismissed today:** 34
**Pending rows after:** 82
**Critical after:** 47

## Pattern

Rows are **permit status** mismatches: internal `npdes_permits.status` vs ECHO facility `permit_status`.

| ECHO status | Count after automation |
|-------------|-----------------------:|
| Expired | 41 |
| Terminated; Compliance Tracking Off | 21 |
| Admin Continued | 19 |
| Expired; Compliance Tracking Off | 1 |

## Automation split

| Bucket | Before | After | Action |
|--------|-------:|------:|--------|
| Dismiss with note | 0 | 0 | Safe only when ECHO status maps to the current internal status |
| One-click align candidate | 82 | 82 | Confirm lifecycle, then use Review Queue's status-align button |
| Human judgment | 0 | 0 | Missing context or unmapped external status |

## Operator action

Use **Review Queue** → filter **Type: Status Mismatch**. The semantic dismiss action/script only clears rows where no internal permit lifecycle change is needed. For remaining rows, confirm SCC/ECHO authority before clicking **Set internal status** in the detail panel, then dismiss with notes.

## Artifacts

- `slice4-status-mismatch-dismiss-with-note-2026-07-03.csv` — current rows eligible for semantic dismiss.
- `slice4-status-mismatch-safe-dismissed-2026-07-03.csv` — safe semantic rows dismissed today.
- `slice4-status-mismatch-one-click-align-2026-07-03.csv` — rows with an internal target status and permit id.
- `slice4-status-mismatch-human-judgment-2026-07-03.csv` — rows missing safe automation context.
- `slice4-status-mismatch-operator-final-2026-07-03.md` — final operator list excluding rows already safe-dismissed.

## Sample after automation (first 10)

```json
[
  {
    "id": "aa9b670d-02e1-4f60-8bd9-207949b19ab6",
    "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
    "npdes_id": "AL0062693",
    "source": "echo",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Admin Continued\"",
    "discrepancy_type": "status_mismatch",
    "internal_value": "active",
    "external_value": "Admin Continued",
    "internal_source_table": "npdes_permits",
    "internal_source_id": "95b21694-a93a-4ac4-9d96-445227a5347d",
    "external_source_id": "c9370901-74c5-44ad-b935-bab85ef45526",
    "detected_at": "2026-07-02T22:25:19.29538+00:00",
    "reviewed_at": null,
    "updated_at": "2026-07-02T22:25:19.29538+00:00",
    "dismiss_reason": null,
    "review_notes": null,
    "recurrence_count": 1
  },
  {
    "id": "1cb74e21-31ff-48aa-bdc0-adf386cc754a",
    "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
    "npdes_id": "AL0062693",
    "source": "echo",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Admin Continued\"",
    "discrepancy_type": "status_mismatch",
    "internal_value": "active",
    "external_value": "Admin Continued",
    "internal_source_table": "npdes_permits",
    "internal_source_id": "95b21694-a93a-4ac4-9d96-445227a5347d",
    "external_source_id": "c9370901-74c5-44ad-b935-bab85ef45526",
    "detected_at": "2026-07-02T22:26:13.150073+00:00",
    "reviewed_at": null,
    "updated_at": "2026-07-02T22:26:13.150073+00:00",
    "dismiss_reason": null,
    "review_notes": null,
    "recurrence_count": 1
  },
  {
    "id": "23dc05b8-671d-4128-80da-58269b3481b8",
    "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
    "npdes_id": "AL0072991",
    "source": "echo",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Terminated; Compliance Tracking Off\"",
    "discrepancy_type": "status_mismatch",
    "internal_value": "active",
    "external_value": "Terminated; Compliance Tracking Off",
    "internal_source_table": "npdes_permits",
    "internal_source_id": "13e1c5ce-e10f-4dc8-9ab8-456087bb7d54",
    "external_source_id": "5be1b4b4-d6de-4482-8e78-d40493c7315c",
    "detected_at": "2026-07-02T22:26:29.284889+00:00",
    "reviewed_at": null,
    "updated_at": "2026-07-02T22:26:29.284889+00:00",
    "dismiss_reason": null,
    "review_notes": null,
    "recurrence_count": 1
  },
  {
    "id": "60d43ecf-28f4-4507-9168-f3eec61c2a09",
    "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
    "npdes_id": "AL0073920",
    "source": "echo",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Terminated; Compliance Tracking Off\"",
    "discrepancy_type": "status_mismatch",
    "internal_value": "active",
    "external_value": "Terminated; Compliance Tracking Off",
    "internal_source_table": "npdes_permits",
    "internal_source_id": "5e3c8e82-cb01-47ca-ad84-09c8cb0355b0",
    "external_source_id": "2b9aa409-55a8-482d-bcbd-7ca17bae6c45",
    "detected_at": "2026-07-02T22:26:34.478306+00:00",
    "reviewed_at": null,
    "updated_at": "2026-07-02T22:26:34.478306+00:00",
    "dismiss_reason": null,
    "review_notes": null,
    "recurrence_count": 1
  },
  {
    "id": "2a67e30b-8b3b-474f-b957-b74175e5489a",
    "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
    "npdes_id": "AL0078026",
    "source": "echo",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Terminated; Compliance Tracking Off\"",
    "discrepancy_type": "status_mismatch",
    "internal_value": "active",
    "external_value": "Terminated; Compliance Tracking Off",
    "internal_source_table": "npdes_permits",
    "internal_source_id": "af9a0d2f-02d0-4ce2-a345-3a9b9cd8ec5f",
    "external_source_id": "21717d85-f0ef-4cfd-acb6-5e1143e60c50",
    "detected_at": "2026-07-02T22:27:13.278243+00:00",
    "reviewed_at": null,
    "updated_at": "2026-07-02T22:27:13.278243+00:00",
    "dismiss_reason": null,
    "review_notes": null,
    "recurrence_count": 1
  },
  {
    "id": "2d8a2d08-d7e2-41a4-b817-5aa9b24d3ea9",
    "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
    "npdes_id": "AL0078867",
    "source": "echo",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Admin Continued\"",
    "discrepancy_type": "status_mismatch",
    "internal_value": "active",
    "external_value": "Admin Continued",
    "internal_source_table": "npdes_permits",
    "internal_source_id": "25b19059-6387-4ebc-bb8d-0f0ebba5cb2b",
    "external_source_id": "14e540c8-c19a-4fa8-9aae-fcd5ed90ab13",
    "detected_at": "2026-07-02T22:27:16.357282+00:00",
    "reviewed_at": null,
    "updated_at": "2026-07-02T22:27:16.357282+00:00",
    "dismiss_reason": null,
    "review_notes": null,
    "recurrence_count": 1
  },
  {
    "id": "7a9605b0-a79c-4fb6-8aa2-a40dca8cc8fc",
    "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
    "npdes_id": "KYGE40958",
    "source": "echo",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Terminated; Compliance Tracking Off\"",
    "discrepancy_type": "status_mismatch",
    "internal_value": "active",
    "external_value": "Terminated; Compliance Tracking Off",
    "internal_source_table": "npdes_permits",
    "internal_source_id": "c7bc0ce1-86b9-434f-9294-c29612d37e4f",
    "external_source_id": "3d687266-5591-4ed7-ac63-56444070e001",
    "detected_at": "2026-07-02T22:28:51.333347+00:00",
    "reviewed_at": null,
    "updated_at": "2026-07-02T22:28:51.333347+00:00",
    "dismiss_reason": null,
    "review_notes": null,
    "recurrence_count": 1
  },
  {
    "id": "7cbf0b87-20d8-4de2-a0b3-e9b115b0c951",
    "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
    "npdes_id": "KYGE40999",
    "source": "echo",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Expired\"",
    "discrepancy_type": "status_mismatch",
    "internal_value": "active",
    "external_value": "Expired",
    "internal_source_table": "npdes_permits",
    "internal_source_id": "31a580ae-7b0b-4dcc-8bd0-af0597e37b89",
    "external_source_id": "67753d96-a70e-4911-ab77-285e1182be1a",
    "detected_at": "2026-07-02T22:29:15.834543+00:00",
    "reviewed_at": null,
    "updated_at": "2026-07-02T22:29:15.834543+00:00",
    "dismiss_reason": null,
    "review_notes": null,
    "recurrence_count": 1
  },
  {
    "id": "8707c057-6c1d-427b-8d75-0285ffade343",
    "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
    "npdes_id": "TN0043222",
    "source": "echo",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Expired\"",
    "discrepancy_type": "status_mismatch",
    "internal_value": "active",
    "external_value": "Expired",
    "internal_source_table": "npdes_permits",
    "internal_source_id": "03a1049f-07d6-4a02-a467-7f7235e1e27a",
    "external_source_id": "bdf583a1-d537-4632-8735-e2217b5015cd",
    "detected_at": "2026-07-02T22:29:25.032316+00:00",
    "reviewed_at": null,
    "updated_at": "2026-07-02T22:29:25.032316+00:00",
    "dismiss_reason": null,
    "review_notes": null,
    "recurrence_count": 1
  },
  {
    "id": "a91147fc-3c9d-485b-bcf2-d1746662ac17",
    "organization_id": "2bffc35c-e2c4-4396-868f-207f80e1e2c4",
    "npdes_id": "TN0046647",
    "source": "echo",
    "severity": "medium",
    "description": "Permit status mismatch: internal=\"active\" vs ECHO=\"Terminated; Compliance Tracking Off\"",
    "discrepancy_type": "status_mismatch",
    "internal_value": "active",
    "external_value": "Terminated; Compliance Tracking Off",
    "internal_source_table": "npdes_permits",
    "internal_source_id": "f6adee43-593a-4961-94f2-052dee14c1a2",
    "external_source_id": "fa5fa09f-76a8-40f9-843a-63c2ffd7df81",
    "detected_at": "2026-07-02T22:29:28.002639+00:00",
    "reviewed_at": null,
    "updated_at": "2026-07-02T22:29:28.002639+00:00",
    "dismiss_reason": null,
    "review_notes": null,
    "recurrence_count": 1
  }
]
```
