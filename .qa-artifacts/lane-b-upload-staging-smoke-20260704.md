# Lane B — Upload Dashboard staging smoke (2026-07-04)

**Route:** `/compliance`  
**Automated gate:** `npm run qa:upload-dashboard-staging` — pass (v6 wiring + pipeline logic E2E)  
**Prod:** org RLS `20260701182156_upload_dashboard_org_rls_hardening` applied  
**Spec:** `SCC_Upload_Dashboard_Handoff_v5.md` + v6 DELTA §12

## Manual sign-off (v6 §12)

| Check | Pass | Notes |
|-------|------|-------|
| **1. Non-admin upload test** | ☐ | Log in as a user with Upload Dashboard access (COMPLIANCE_UPLOAD roles). |
| **2. Realtime fires under RLS** | ☐ | Open two browser tabs as the same user. |
| **3. Duplicate detection** | ☐ | Upload the same file twice. |
| **4. Cross-tenant isolation** | ☐ | Log in as Tenant A user → upload a file. |
| **5. Summary stats accuracy** | ☐ | Query npdes_permits count via SQL. Compare to Total Permits stat card. |
| **6. Matrix cell filtering** | ☐ | Click a Compliance Matrix cell (e.g., AL + Permits). |
| **7. Export audit trail** | ☐ | Export Compliance Matrix as CSV. |
| **8. Failed processing forensics** | ☐ | Upload a non-PDF file to permits bucket (force a processing failure). |
| **9. File type validation** | ☐ | Drag an .exe file onto the window. |
| **10. Session expiry** | ☐ | Set a short JWT expiry (or wait). |

## E2E golden path (recommended first manual run)

1. Log in as COMPLIANCE_UPLOAD role user with org assignment.
2. Drag a WV permit PDF to staging → confirm state/category auto-detect.
3. Upload → confirm `file_processing_queue` row with `organization_id` + Storage path `permits/WV/...`.
4. Click **Process** → confirm status moves to `processing` / `parsed` via Realtime.
5. Click Compliance Matrix **WV × NPDES Permits** cell → queue filters to WV permits.
6. Export matrix CSV → confirm `audit_log` row `matrix_export_csv`.

Track in Go-Live: seed group `upload-dashboard-v6`.
