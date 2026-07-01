# Lane B — Upload Dashboard staging smoke (2026-07-01)

**Route:** `/compliance`  
**Tester:** Brian (guided) + agent DB verification  
**User:** `wv-uat-admin@invalid.scc.local`  
**Automated gate:** `npm run qa:upload-dashboard-staging` — pass (22 tests)  
**Prod:** org RLS `20260701182156_upload_dashboard_org_rls_hardening` applied  
**Spec:** `SCC_Upload_Dashboard_Handoff_v5.md` + v6 DELTA §12

## Manual sign-off (v6 §12)

| Check | Pass | Notes |
|-------|------|-------|
| **1. Non-admin upload test** | ☑ | `WV1006304_file0001_3828.pdf` → NPDES Permits + WV → success toast + queue row |
| **2. Realtime fires under RLS** | ☐ | Not run (needs two tabs) |
| **3. Duplicate detection** | ☑ | Hash dedup toast: org-scoped matching file hash |
| **3b. Process (invoke)** | ☑ | After CORS fix: "Processing started…" toast; row reached server (2026-07-01 ~18:54 UTC) |
| **4. Cross-tenant isolation** | ☐ | Not run (needs second tenant login) |
| **5. Summary stats accuracy** | ☐ | Not run (SQL compare) |
| **6. Matrix cell filtering** | ☑ | WV × Permits → queue filtered to 1 WV permit file |
| **7. Export audit trail** | ☑ | Matrix CSV downloaded |
| **8. Failed processing forensics** | ☑ | Failed badge + expandable row shows `Claude API 401: x-api-key header is required` |
| **9. File type validation** | ☐ | Not run (.exe drag) |
| **10. Session expiry** | ☐ | Not run |

## Step 3 / Process — findings

**Browser (before fix):** `Failed to send a request to the Edge Function` — CORS blocked Netlify origin; fixed in `_shared/cors.ts` + deployed `parse-permit-pdf` v60.

**After fix:** Client invoke pass ("Processing started…"). Server row → `failed` until `ANTHROPIC_API_KEY` is set in Supabase Edge Function secrets (`x-api-key header is required`).

Upload + dedup + matrix + export paths validated. Full parse success blocked on ops (API key + PDF), not upload spine.

## E2E golden path

| Step | Result |
|------|--------|
| Stage WV permit PDF | Pass |
| Upload → queue + storage `permits/West_Virginia/…` | Pass |
| Process → parsed | Partial | Invoke pass; parse blocked on `ANTHROPIC_API_KEY` secret until set in Supabase |
| Matrix filter | Pass |
| CSV export | Pass |

Track in Go-Live: seed group `upload-dashboard-v6`.
