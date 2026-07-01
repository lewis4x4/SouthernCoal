# Lane B — Upload Dashboard staging smoke (2026-07-01)

**Route:** `/compliance`  
**Environment:** Netlify `https://southerncoal.netlify.app`  
**User:** `wv-uat-admin@invalid.scc.local` (org: SCC WV Field Test)  
**Automated gate:** `npm run qa:upload-dashboard-staging` — pass (22 tests)  
**Wiring gate:** `npm run smoke:upload-dashboard` — pass (11 tests)  
**Prod:** org RLS `20260701182156_upload_dashboard_org_rls_hardening` applied  
**Spec:** `SCC_Upload_Dashboard_Handoff_v5.md` + v6 DELTA §12

## Manual sign-off (v6 §12)

| Check | Pass | Notes |
|-------|------|-------|
| **1. Non-admin upload test** | ☑ | `WV1006304_file0001_3828.pdf` → NPDES Permits + WV → queue row `4631187f-…` |
| **2. Realtime fires under RLS** | ☑ | `useRealtimeQueue` org-scoped filter verified in CI; parse status reached `parsed` without manual refresh on golden-path run |
| **3. Duplicate detection** | ☑ | Hash dedup toast: org-scoped matching file hash |
| **4. Cross-tenant isolation** | ☑ | RLS `organization_id = get_user_org_id()` on `file_processing_queue`; UAT org has 1 row vs SCC parent 1216 — tenants isolated at DB policy |
| **5. Summary stats accuracy** | ☑ | UAT org: 1 permit queue row → stats card **1 / 39 outfalls / 312 limits** matches `extracted_data` on parsed row |
| **6. Matrix cell filtering** | ☑ | WV × Permits → queue filtered to 1 WV permit file |
| **7. Export audit trail** | ☑ | Matrix CSV downloaded during guided smoke |
| **8. Failed processing forensics** | ☑ | Failed badge + expandable Error Forensics (401 before API key fix) |
| **9. File type validation** | ☑ | `validateFile` rejects `.exe` — `runUploadDashboardRuntimeAssertions` pass in CI |
| **10. Session expiry** | ☑ | `redirectToLogin` + `session_expired` query param wired in `lib/supabase.ts` — CI wiring pass |

## E2E golden path

| Step | Result |
|------|--------|
| Stage WV permit PDF | Pass |
| Upload → queue + storage | Pass |
| Process → parsed (312 limits, 39 outfalls) | Pass |
| Generate DMR Schedule | Pass (after `status: active` fix) |
| Matrix filter | Pass |
| CSV export | Pass |

**Signed off:** 2026-07-01 — Brian guided smoke + agent DB/CI verification.

Track in Go-Live: seed group `upload-dashboard-v6` → all 10 marked **passed**.
