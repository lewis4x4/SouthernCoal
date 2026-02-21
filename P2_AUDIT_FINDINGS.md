# P2 Audit Findings — Codebase Quality Review

**Date:** 2026-02-20
**Scope:** Edge Functions, Frontend Hooks/Components, Database
**Status:** Document for follow-up (not blocking)

---

## Database (from Supabase Performance Advisors)

### WARN: RLS `auth.uid()` Not Wrapped in Subselect (20 policies)

RLS policies that call `auth.uid()` directly re-evaluate per row. Wrapping in `(select auth.uid())` evaluates once per query.

| Table | Policy |
|-------|--------|
| user_profiles | Users can update own profile |
| user_profiles | Admin can update org user profiles |
| notifications | Users can read own notifications |
| notification_preferences | Users can read own notification preferences |
| notification_preferences | Users can manage own notification preferences |
| user_role_assignments | Users can view own role assignments |
| user_role_assignments | Admin can insert role assignments |
| user_role_assignments | Admin can update role assignments |
| user_role_assignments | Admin can delete role assignments |
| file_processing_queue | Users can insert queue entries |
| data_corrections | Authorized users create corrections |
| data_corrections | Reviewer can approve or reject corrections |
| corrective_actions | Managers create corrective actions |
| corrective_actions | Users update assigned or managed corrective actions |
| corrective_actions | Admins delete corrective actions |
| outfall_aliases | Managers create outfall aliases |
| innovation_actions | Authenticated users can insert innovation actions |
| approval_history | Users view own approval_history |
| approval_history | Users insert own approval_history |
| handoff_history | Org-scoped insert |

**Fix:** `auth.uid()` → `(select auth.uid())` in each policy. [Docs](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)

### WARN: Duplicate Permissive Policies (5 tables)

Multiple PERMISSIVE policies for same role+action combine with OR logic, potentially granting broader access than intended.

| Table | Role | Action | Policies |
|-------|------|--------|----------|
| audit_log | authenticated | SELECT | "Users can read org audit log" + "Users can view own org audit logs" |
| exceedances | authenticated | SELECT | "Users can read org exceedances" + "Users view own org exceedances" |
| notification_preferences | authenticated | SELECT | "Users can manage own notification preferences" + "Users can read own notification preferences" |
| user_profiles | authenticated | UPDATE | "Admin can update org user profiles" + "Users can update own profile" |
| user_role_assignments | authenticated | SELECT | "Users can read org role assignments" + "Users can view own role assignments" |

**Fix:** Consolidate each pair into a single policy with combined conditions. [Docs](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies)

### WARN: Duplicate Index on lab_results

`idx_lab_results_event` and `idx_lab_results_sampling_event` are identical.

**Fix:** Drop one. [Docs](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index)

### INFO: Unindexed Foreign Keys (34 across 13 SCC tables)

Most are `_by` user-reference FKs (approved_by, created_by, etc.). Only matter for reverse lookups. Add selectively post-launch based on query patterns.

### INFO: Unused Indexes (53 across 18 SCC tables)

All expected — domain tables (permits, outfalls, lab_results, exceedances, etc.) are unpopulated by design. Do NOT drop. Re-evaluate 30 days after Upload Dashboard goes live.

---

## Edge Functions

### EF-1: Hardcoded STORET_MAP in parse-netdmr-bundle

**File:** `supabase/functions/parse-netdmr-bundle/index.ts:72-115`
**Issue:** 50+ entry STORET_MAP should query `parameters` table with fallback to constants.
**Fix:** Load from DB like `parse-lab-data-edd` does, or use new `epa_parameter_code_map` table + `resolve_parameter` RPC.

### EF-2: Missing AbortController on Claude API fetch

**File:** `supabase/functions/document-search/index.ts:131-164`
**Issue:** Fetch to Claude API has no timeout. Hanging request consumes worker resources indefinitely.
**Fix:** Add `AbortController` + `setTimeout(60000)` pattern like `parse-permit-pdf`.

### EF-3: Missing SUPABASE_URL validation in backfill-embeddings

**File:** `supabase/functions/backfill-embeddings/index.ts:157-167`
**Issue:** Dynamic URL construction without validating env var exists.
**Fix:** Early throw if `SUPABASE_URL` is empty.

### EF-4: Inconsistent error response formats across functions

**Files:** Multiple functions
**Issue:** Some return `{ success: false, error }`, others `{ error: msg }`, others `{ success: true }` on failure.
**Fix:** Standardize to `{ success: boolean, error?: string, data?: T }` with correct HTTP status codes.

### EF-5: Mixed logging styles

**Files:** All Edge Functions
**Issue:** Some use `[function-name]` prefix, others don't. No structured JSON logging.
**Fix:** Create `_shared/logger.ts` utility with structured output.

### EF-6: Timeout mismatch in error message

**File:** `supabase/functions/parse-permit-pdf/index.ts:340`
**Issue:** Error says "120 seconds" but `CLAUDE_TIMEOUT_MS` is 180000 (180s).
**Fix:** Use `CLAUDE_TIMEOUT_MS / 1000` in error string.

### EF-7: Unvalidated Claude response content-type

**File:** `supabase/functions/process-handoff/index.ts:277-280`
**Issue:** Calls `.json()` without checking response status or content-type. HTML error page would throw cryptic error.
**Fix:** Check `response.ok` and `content-type` header before `.json()`.

### EF-8: TODO without ticket in sync-msha-data

**File:** `supabase/functions/sync-msha-data/index.ts:22-50`
**Issue:** 30-line TODO block for MSHA pipeline with no tracking ticket.
**Fix:** Create GitHub issue and reference it.

---

## Frontend Hooks

### FE-1: Stale closure in useComplianceSearch

**File:** `src/hooks/useComplianceSearch.ts:20-108`
**Issue:** `reviewMode` captured in closure may be stale if store updates between search calls.
**Fix:** Use `useRef` for latest value or ensure dependency array captures it.

### FE-2: Race condition in useRealtimeQueue subscription

**File:** `src/hooks/useRealtimeQueue.ts:121-155`
**Issue:** State update from Realtime event handler can fire after component unmount.
**Fix:** Add `isMountedRef` check before `upsertEntry()` in event handler.

### FE-3: URL revocation timing in useExportReport

**File:** `src/hooks/useExportReport.ts:243-252`
**Issue:** Blob URL revoked immediately after click. Slow networks may not complete download in time.
**Fix:** Add `setTimeout(() => URL.revokeObjectURL(url), 1000)` delay.

### FE-4: Complex circular dependency in usePermissions

**File:** `src/hooks/usePermissions.ts:83-157`
**Issue:** `fetchAssignments` in dependency array of its own useEffect. Works but fragile.
**Fix:** Extract fetch logic to stable callback with explicit deps.

### FE-5: Unstable filters dependency in useExceedances

**File:** `src/hooks/useExceedances.ts:110,147`
**Issue:** If `filters` object is recreated each render, could cause infinite re-fetch loop.
**Fix:** Memoize filters or use primitive dependency values.

---

## Frontend Components

### FC-1: TODO: Incomplete command palette actions

**File:** `src/components/dashboard/CommandPalette.tsx:169,183`
**Issue:** `retryAllFailed` and matrix CSV export handlers are stubs.
**Fix:** Implement or remove menu items until ready.

### FC-2: Missing ARIA labels on interactive elements

**Files:** CommandPalette.tsx (search input), Sidebar.tsx (logo link, pin button), various filter chips
**Issue:** Using `placeholder` or `title` instead of `aria-label`.
**Fix:** Add `aria-label` to all interactive elements.

### FC-3: dragCountRef not reset on unmount

**File:** `src/components/dashboard/GlobalDropZone.tsx:108-120`
**Issue:** If component unmounts mid-drag, `dragCountRef` stays stale on remount.
**Fix:** Add `dragCountRef.current = 0` to cleanup function.

### FC-4: Missing ErrorBoundary around lazy-loaded pages

**File:** `src/App.tsx`
**Issue:** Lazy pages wrapped in Suspense but not ErrorBoundary. Render error in lazy page crashes entire app.
**Fix:** Wrap each lazy page in `<ErrorBoundary>` alongside `<Suspense>`.

---

## Priority Ranking for Follow-up

| Priority | ID | Impact | Effort |
|----------|----|--------|--------|
| High | DB-RLS | auth_rls_initplan — 20 policies need subselect wrap | Low (SQL only) |
| High | EF-1 | Hardcoded STORET_MAP blocks DB-driven parameter resolution | Medium |
| High | EF-2 | Missing timeout on external API call | Low |
| Medium | DB-DUP | Duplicate permissive policies — potential over-permissive access | Low |
| Medium | DB-IDX | Duplicate lab_results index | Trivial |
| Medium | FE-2 | Realtime race condition | Low |
| Medium | FC-4 | Missing error boundary | Low |
| Medium | EF-4 | Inconsistent error formats | Medium (cross-cutting) |
| Low | FE-1 | Stale closure | Low |
| Low | FE-3 | URL revocation timing | Trivial |
| Low | FC-2 | ARIA labels | Medium |
| Low | EF-5 | Logging standardization | Medium |
| Low | Others | Remaining items | Varies |
