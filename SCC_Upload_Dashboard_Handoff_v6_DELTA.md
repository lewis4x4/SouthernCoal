# SCC Compliance Monitoring System — Upload Dashboard Handoff v6 (DELTA)

**This document contains ONLY the changes from v5. Apply these on top of v5 — v5 remains the base spec.**

---

## CHANGELOG — v5 → v6

| # | Change | Source | Risk Level |
|---|--------|--------|------------|
| 1 | Remove hardcoded Supabase credentials from spec | Red-line review | 🔴 CRITICAL |
| 2 | Add RLS prerequisite validation checklist | Both reviews | 🔴 CRITICAL |
| 3 | Fix file dedup uniqueness to be tenant-scoped | Red-line review | 🔴 CRITICAL |
| 4 | Add frontend audit logging for client-only actions | Both reviews | 🟡 HIGH |
| 5 | Add AI extraction trust layer (Draft → Reviewed → Approved) | Both reviews | 🟡 HIGH |
| 6 | Add canonical category mapping (eliminate naming drift) | Red-line review | 🟡 HIGH |
| 7 | Restrict `other` bucket file types in UI | Red-line review | 🟡 MEDIUM |
| 8 | Add role-based access control to Upload Dashboard | CIO/CDO review | 🟡 MEDIUM |
| 9 | Scope Realtime subscriptions per tenant/org | Red-line review | 🟡 MEDIUM |
| 10 | Add disclaimer integration spec | CIO/CDO review | 🟢 LOW |
| 11 | Add JWT refresh handling during uploads | CIO/CDO review | 🟢 LOW |
| 12 | Add production-readiness smoke test checklist | Red-line review | 🟢 LOW |
| 13 | Add `file_processing_queue` to schema doc alignment note | Red-line review | 🟢 LOW |
| 14 | Clarify "seeded vs still needed" data boundary | Red-line review | 🟢 LOW |

---

## 1. REMOVE HARDCODED SUPABASE CREDENTIALS FROM SPEC

**v5 problem:** The Supabase Project section contains the full anon key in plaintext. This doc gets copied into tickets, vendor chats, AI tools, and screenshots.

**v6 fix:** Replace the SUPABASE PROJECT section with:

```
## SUPABASE PROJECT

- **Project ID:** See `.env` file or team vault
- **URL:** Set via `VITE_SUPABASE_URL` environment variable
- **Anon Key:** Set via `VITE_SUPABASE_ANON_KEY` environment variable

Credentials are stored in:
1. Local development: `.env.local` (gitignored)
2. CI/CD: GitHub Actions secrets or equivalent
3. Team reference: Shared vault (1Password / Bitwarden)

DO NOT commit credentials to any document, spec, or repository.
```

The project ID `zymenlnwyzpnohljwifx` can remain referenced where needed for Supabase CLI commands or MCP tool calls, but the anon key must be removed from this document entirely.

---

## 2. RLS PREREQUISITE VALIDATION CHECKLIST

**v5 problem:** RLS is "enabled" on all 44 tables, but the CMS Schema Documentation states policies "will be implemented when the frontend is built" and all tables are "locked down by default (no access until policies are created)." The Upload Dashboard assumes it can SELECT from `file_processing_queue`, subscribe via Realtime, and query counts from `npdes_permits`, `outfalls`, `permit_limits`. Without policies, the UI is dead on arrival.

**v6 fix:** Add this section immediately after the SUPABASE PROJECT section:

### RLS Policies — MUST EXIST BEFORE FRONTEND TESTING

The following minimum viable RLS policies must be applied **before** testing any Upload Dashboard functionality. These are SELECT/INSERT policies only — they do not modify schema.

```sql
-- file_processing_queue: authenticated users can see their org's files
CREATE POLICY "Users can view own org queue entries"
ON file_processing_queue FOR SELECT
TO authenticated
USING (
  uploaded_by IN (
    SELECT id FROM user_profiles
    WHERE organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

-- file_processing_queue: Realtime requires SELECT policy to function
-- Realtime subscription filter: filter=organization_id=eq.{user_org_id}

-- npdes_permits, outfalls, permit_limits: read access for stats
CREATE POLICY "Users can view own org permits"
ON npdes_permits FOR SELECT TO authenticated
USING (
  site_id IN (
    SELECT id FROM sites
    WHERE organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);
-- Repeat pattern for outfalls and permit_limits (scoped via site → org chain)

-- documents: authenticated users can view own org documents
CREATE POLICY "Users can view own org documents"
ON documents FOR SELECT TO authenticated
USING (
  organization_id = (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  )
);

-- audit_log: INSERT for authenticated (already noted in schema doc)
-- Already exists per CMS Schema Documentation
```

**Smoke test before UI work:**
1. Create a test user via Supabase Auth
2. Assign them to an organization in `user_profiles`
3. Insert a test row into `file_processing_queue` with matching `uploaded_by`
4. Confirm: `supabase.from('file_processing_queue').select('*')` returns the row
5. Confirm: Realtime subscription fires on INSERT/UPDATE
6. Confirm: `supabase.from('npdes_permits').select('*', { count: 'exact', head: true })` returns 0 (not error)

If any of these fail, the RLS policies are missing or misconfigured. Fix before proceeding.

---

## 3. FIX FILE DEDUP UNIQUENESS — TENANT SCOPING

**v5 problem:** `file_processing_queue` has `UNIQUE(file_hash, storage_bucket)`. This is a global constraint. In multi-tenant SaaS:
- Tenant A uploads a permit PDF → Tenant B uploads the same PDF → B gets "duplicate" error
- B implicitly learns someone else already uploaded this file (data leak)
- B cannot upload their own copy of a standard regulatory document

**v6 fix:** The unique constraint must include tenant/org scoping. Since this requires a DB migration (which we said not to modify), handle it at two levels:

**Level 1 — Frontend (immediate, no DB change):**
The frontend must include `organization_id` in the `file-upload-handler` payload. Update the Edge Function call:

```typescript
const response = await fetch(`${SUPABASE_URL}/functions/v1/file-upload-handler`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session?.access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    bucket,
    path,
    fileName,
    fileSize,
    mimeType,
    stateCode,
    category,
    organizationId: userProfile.organization_id  // ← NEW
  })
});
```

**Level 2 — DB migration (separate task, file as issue):**
```sql
-- Drop old constraint
ALTER TABLE file_processing_queue
DROP CONSTRAINT file_processing_queue_file_hash_storage_bucket_key;

-- Add org-scoped column if not present
ALTER TABLE file_processing_queue
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

-- Add tenant-scoped uniqueness
ALTER TABLE file_processing_queue
ADD CONSTRAINT file_processing_queue_org_hash_bucket_key
UNIQUE(organization_id, file_hash, storage_bucket);
```

**For MVP (SCC single-tenant):** The current constraint works because there's only one org. But this MUST be resolved before any second customer onboards. Add a `// TODO: MULTI-TENANT` comment in the upload hook.

---

## 4. FRONTEND AUDIT LOGGING FOR CLIENT-ONLY ACTIONS

**v5 problem:** v5 says "the frontend does NOT need separate audit logging" because Edge Functions handle it. But client-side actions that never hit an Edge Function create blind spots:
- Compliance Matrix CSV/markdown exports
- Bulk "Process All" clicks
- Staging area clear-all
- Command palette actions
- Manual filter changes on compliance-critical views

In litigation/regulatory discovery, "who exported what and when" matters.

**v6 fix:** Add a lightweight `useAuditLog` hook that inserts into `audit_log` for client-only actions. The schema doc confirms `audit_log` has INSERT policies for authenticated users — no DB change needed.

```typescript
// hooks/useAuditLog.ts
import { supabase } from '@/lib/supabase';

type AuditAction =
  | 'matrix_export_csv'
  | 'matrix_export_markdown'
  | 'bulk_process_queued'
  | 'bulk_retry_failed'
  | 'staging_clear_all'
  | 'queue_filter_change'
  | 'command_palette_action';

export const useAuditLog = () => {
  const log = async (action: AuditAction, details?: Record<string, unknown>) => {
    try {
      await supabase.from('audit_log').insert({
        action,
        entity_type: 'upload_dashboard',
        details: details ?? {},
        // user_id and timestamp handled by DB defaults/RLS
      });
    } catch {
      // Audit logging failures must never block UI — fire and forget
      console.warn('Audit log insert failed');
    }
  };
  return { log };
};
```

**Update project structure — add to `/hooks`:**
```
useAuditLog.ts              ← Client-side audit trail for exports, bulk actions, filters
```

**Update CONSTRAINTS section — replace this line:**
> ~~Every action is audit-logged by the Edge Functions — the frontend does NOT need separate audit logging~~

With:
> Edge Functions audit-log all server-side actions (uploads, processing, imports). The frontend MUST ALSO log client-only actions (exports, bulk operations, staging clears) via direct insert to `audit_log`. Use the `useAuditLog` hook. Audit log inserts are fire-and-forget — never block UI.

---

## 5. AI EXTRACTION TRUST LAYER

**v5 problem:** `parse-permit-pdf` uses AI to extract permit data and inserts directly into `npdes_permits`, `outfalls`, `permit_limits`. A single mis-extracted limit (wrong unit, daily_max vs monthly_avg, wrong outfall mapping) cascades into:
- Missed exceedances → Consent Decree violations → stipulated penalties
- False exceedances → operational chaos, unnecessary corrective actions
- Wrong DMR calculations → regulatory submission errors

**v6 fix:** Add a verification status concept to the UI without modifying the database. The `file_processing_queue.extracted_data` JSONB field already stores what was extracted. Use it.

### 5a. Processing Queue — New "Review" Column

Add a column to the Processing Queue table: **Verification Status**

| Badge | Meaning |
|-------|---------|
| 🟣 `Unreviewed` | AI extracted data, no human has checked it |
| 🟡 `In Review` | Someone opened the extraction details |
| 🟢 `Verified` | Human confirmed extraction is correct |
| 🔴 `Disputed` | Human flagged extraction errors |

Store verification status in the `queue.ts` Zustand store keyed by `queue_id`. Persist to `localStorage` until a proper DB field is added.

### 5b. Expanded Row — Extraction Evidence Panel

When a successfully parsed permit row is expanded, show TWO sections:

**Section 1: Extraction Summary (always visible)**
- Permit number extracted
- State detected
- Outfall count found
- Limit count found
- Confidence indicators where available from `extracted_data`

**Section 2: Extraction Detail (collapsible)**
- Table showing each extracted limit: outfall, parameter, limit type, value, unit
- Side-by-side with a "Flag Issue" button per row
- "Mark All Verified" button at the bottom

### 5c. Compliance Matrix — Unreviewed Indicator

Add a 6th cell state to the Compliance Matrix:

| Dot | Meaning |
|-----|---------|
| 🟢 Green + checkmark | Imported AND verified |
| 🟢 Green (no checkmark) | Imported but unreviewed |
| *(all other states unchanged)* | |

This creates visual pressure to review AI extractions without blocking the workflow.

### 5d. Summary Stats — New Card

Add a stat card: **"Permits Awaiting Review"** — count of queue entries with status `imported` and verification status `Unreviewed`.

**Add to project structure:**
```
/stores
  verification.ts            ← Zustand store for per-queue-id verification status (localStorage-backed)
```

---

## 6. CANONICAL CATEGORY MAPPING

**v5 problem:** Category names drift across contexts:
- `file_processing_queue.file_category`: `npdes_permit`, `lab_data`, `water_monitoring`, `quarterly_report`, `dmr`, `audit_report`, `enforcement`, `other`
- Compliance Matrix X-axis labels: `permits`, `lab-data`, `water-monitoring`, `dmrs`, `quarterly-reports`, `audit-reports`, `enforcement`, `other`
- Storage bucket names: `permits`, `lab-data`, `water-monitoring`, `quarterly-reports`, `dmrs`, `audit-reports`, `enforcement`, `other`

Three different naming conventions for the same 8 categories. This will cause mismatched filters, broken counts, and silent bugs.

**v6 fix:** Add a single canonical mapping to `constants.ts`:

```typescript
// lib/constants.ts

export interface CategoryConfig {
  /** Database enum value in file_processing_queue.file_category */
  dbKey: string;
  /** Storage bucket name */
  bucket: string;
  /** Human-readable display label */
  label: string;
  /** Compliance Matrix column header */
  matrixLabel: string;
  /** Accepted MIME types */
  acceptedTypes: string[];
  /** Upload priority (1 = highest) */
  priority: number;
}

export const CATEGORIES: CategoryConfig[] = [
  {
    dbKey: 'npdes_permit',
    bucket: 'permits',
    label: 'NPDES Permits',
    matrixLabel: 'Permits',
    acceptedTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff'],
    priority: 1,
  },
  {
    dbKey: 'lab_data',
    bucket: 'lab-data',
    label: 'Lab Data',
    matrixLabel: 'Lab Data',
    acceptedTypes: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/tab-separated-values'],
    priority: 2,
  },
  {
    dbKey: 'water_monitoring',
    bucket: 'water-monitoring',
    label: 'Water Monitoring',
    matrixLabel: 'Water Mon.',
    acceptedTypes: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf'],
    priority: 3,
  },
  {
    dbKey: 'quarterly_report',
    bucket: 'quarterly-reports',
    label: 'Quarterly Reports',
    matrixLabel: 'Quarterly',
    acceptedTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    priority: 4,
  },
  {
    dbKey: 'dmr',
    bucket: 'dmrs',
    label: 'DMRs',
    matrixLabel: 'DMRs',
    acceptedTypes: ['application/pdf', 'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    priority: 4,
  },
  {
    dbKey: 'audit_report',
    bucket: 'audit-reports',
    label: 'Audit Reports',
    matrixLabel: 'Audits',
    acceptedTypes: ['application/pdf'],
    priority: 5,
  },
  {
    dbKey: 'enforcement',
    bucket: 'enforcement',
    label: 'Enforcement',
    matrixLabel: 'Enforcement',
    acceptedTypes: ['application/pdf'],
    priority: 6,
  },
  {
    dbKey: 'other',
    bucket: 'other',
    label: 'Other',
    matrixLabel: 'Other',
    acceptedTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'text/plain', 'image/png', 'image/jpeg', 'image/tiff'],
    priority: 7,
  },
];

// Lookup helpers
export const CATEGORY_BY_DB_KEY = Object.fromEntries(CATEGORIES.map(c => [c.dbKey, c]));
export const CATEGORY_BY_BUCKET = Object.fromEntries(CATEGORIES.map(c => [c.bucket, c]));
```

**Every component** must use these helpers instead of hardcoded strings:
- Smart Staging: `CATEGORY_BY_DB_KEY[autoClassifiedCategory].bucket` for upload path
- Processing Queue: `CATEGORY_BY_DB_KEY[row.file_category].label` for display
- Compliance Matrix: `CATEGORIES.map(c => c.matrixLabel)` for column headers
- Priority Guide: `CATEGORIES.sort((a,b) => a.priority - b.priority)` for ordering
- File validation: `CATEGORY_BY_BUCKET[targetBucket].acceptedTypes.includes(file.type)`

---

## 7. RESTRICT `other` BUCKET FILE TYPES IN UI

**v5 problem:** The `other` bucket accepts "Any" file type. Without a UI-side allow-list, it becomes a malware junk drawer — anyone can upload .exe, .bat, .sh, .dll files.

**v6 fix:** See `CATEGORIES` config above — the `other` bucket's `acceptedTypes` is now restricted to: PDF, DOCX, XLSX, XLS, CSV, TXT, PNG, JPEG, TIFF. The bucket server-side may accept anything, but the **frontend enforces the allow-list** and blocks upload of non-listed types with an error toast:

> "The 'Other' category accepts PDF, Word, Excel, CSV, text, and image files only. {filename} ({type}) is not allowed."

---

## 8. ROLE-BASED ACCESS CONTROL — UPLOAD DASHBOARD

**v5 problem:** 8 roles are defined but the Upload Dashboard spec doesn't specify which roles can do what. A Read-Only user shouldn't upload. A Lab Tech shouldn't process permits.

**v6 fix:** Add role-permission matrix for the Upload Dashboard:

| Action | Executive | Site Mgr | Env Mgr | Safety Mgr | Field Sampler | Lab Tech | Admin | Read-Only |
|--------|-----------|----------|---------|------------|---------------|----------|-------|-----------|
| View dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Upload files | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Process permits | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Retry failed | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Bulk process all | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Export matrix | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Verify extractions | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Set expected counts | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Command palette | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Implementation:**
```typescript
// hooks/usePermissions.ts
import { useUserProfile } from './useUserProfile';

const ROLE_PERMISSIONS: Record<string, string[]> = {
  executive:            ['view', 'upload', 'process', 'retry', 'bulk_process', 'export', 'verify', 'set_expected'],
  site_manager:         ['view', 'upload', 'export'],
  environmental_manager:['view', 'upload', 'process', 'retry', 'bulk_process', 'export', 'verify', 'set_expected'],
  safety_manager:       ['view', 'upload'],
  field_sampler:        ['view', 'upload'],
  lab_tech:             ['view', 'upload'],
  admin:                ['view', 'upload', 'process', 'retry', 'bulk_process', 'export', 'verify', 'set_expected'],
  read_only:            ['view', 'export'],
};

export const usePermissions = () => {
  const { role } = useUserProfile();
  const can = (action: string) => ROLE_PERMISSIONS[role]?.includes(action) ?? false;
  return { can };
};
```

Disable buttons (grayed out with tooltip "Requires Environmental Manager or Admin role") for unauthorized actions. Never hide the buttons entirely — users need to know the feature exists.

---

## 9. SCOPE REALTIME SUBSCRIPTIONS PER TENANT

**v5 problem:** No guidance on Realtime subscription filtering. Subscribing to all `file_processing_queue` changes across all tenants is both a data leak and a performance problem at scale.

**v6 fix:** Update the `useRealtimeQueue` hook spec:

```typescript
// hooks/useRealtimeQueue.ts
const channel = supabase
  .channel('queue-changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'file_processing_queue',
      // RLS handles row-level filtering, but we add an explicit filter
      // to reduce WebSocket noise at the Realtime server level
      filter: `uploaded_by=in.(${orgUserIds.join(',')})`,
    },
    (payload) => handleQueueChange(payload)
  )
  .subscribe();
```

If org-level filtering isn't feasible via the `filter` param (depends on Supabase Realtime capabilities), rely on RLS + client-side filtering: receive events, check `payload.new.uploaded_by` against known org users, discard non-matching.

---

## 10. DISCLAIMER INTEGRATION SPEC

**v5 problem:** The Software Disclaimer document exists but the dashboard spec doesn't specify where or how to render it.

**v6 fix:**

**App footer (persistent on every page):**
Use the short-form disclaimer from the Software Disclaimer document. Render in `Text Muted` color (#475569), 11px, with a "Full Disclaimer" link that opens a modal with the complete text.

```
This software is a compliance monitoring and reporting tool only. It is not an Environmental
Management System (EMS), does not provide environmental consulting or legal advice, and does
not certify regulatory compliance. All data, permit limits, and reporting parameters are defined
by the user. All reports must be independently verified by qualified personnel before regulatory
submission. Use of this software does not replace the need for licensed environmental
professionals or legal counsel. [Full Disclaimer]
```

**Report exports (matrix CSV/markdown, any future PDF exports):**
Append the one-liner to the last row/line:

```
Generated by SCC Compliance Monitor — a compliance reporting tool. Not an EMS. Not legal or
environmental consulting. All data and reports require independent verification by qualified
personnel before regulatory submission.
```

**Add to project structure:**
```
/components
  /legal
    DisclaimerFooter.tsx       ← Persistent short-form footer
    DisclaimerModal.tsx        ← Full disclaimer text modal
```

---

## 11. JWT REFRESH DURING UPLOADS

**v5 problem:** Auth section shows `getSession()` but doesn't handle token refresh during long upload sessions. A user staging 50 files over 30 minutes will hit session expiry mid-upload.

**v6 fix:** Add to the `useFileUpload` hook:

```typescript
// Before each upload in the concurrency queue, refresh the session
const getFreshToken = async (): Promise<string> => {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    // Session completely dead — redirect to login
    window.location.href = '/login?reason=session_expired';
    throw new Error('Session expired');
  }

  // Supabase JS client auto-refreshes if token is within refresh window
  // But we explicitly check to be safe
  const expiresAt = session.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);
  const REFRESH_THRESHOLD = 60; // refresh if expiring within 60 seconds

  if (expiresAt - now < REFRESH_THRESHOLD) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) {
      window.location.href = '/login?reason=refresh_failed';
      throw new Error('Token refresh failed');
    }
    return refreshed.session.access_token;
  }

  return session.access_token;
};
```

Call `getFreshToken()` inside the upload concurrency loop before each `fetch()` to the Edge Function. Never cache the token across multiple uploads.

---

## 12. PRODUCTION-READINESS SMOKE TEST CHECKLIST

**v6 addition:** Run this 10-minute checklist before declaring the Upload Dashboard "ready":

```
□ 1. NON-ADMIN UPLOAD TEST
     Log in as a Field Sampler role user.
     Upload a PDF to the permits bucket for Alabama.
     Confirm: file appears in Storage at permits/Alabama/{filename}.pdf
     Confirm: file_processing_queue row visible in Processing Queue

□ 2. REALTIME FIRES UNDER RLS
     Open two browser tabs as the same user.
     Upload a file in Tab A.
     Confirm: Tab B Processing Queue updates without manual refresh.

□ 3. DUPLICATE DETECTION
     Upload the same file twice.
     Confirm: second upload shows amber "already uploaded" toast.
     Confirm: no second row appears in queue.

□ 4. CROSS-TENANT ISOLATION (when multi-tenant)
     Log in as Tenant A user → upload a file.
     Log in as Tenant B user → confirm Tenant A's file is NOT visible.
     Upload the same file as Tenant B → confirm it succeeds (not "duplicate").

□ 5. SUMMARY STATS ACCURACY
     Query npdes_permits count via SQL. Compare to stat card.
     Query outfalls count via SQL. Compare to stat card.
     Query permit_limits count via SQL. Compare to stat card.
     Confirm all match.

□ 6. MATRIX CELL FILTERING
     Click a Compliance Matrix cell (e.g., AL + Permits).
     Confirm: Processing Queue filters to show only AL permit files.

□ 7. EXPORT AUDIT TRAIL
     Export Compliance Matrix as CSV.
     Query audit_log for the export action.
     Confirm: row exists with action='matrix_export_csv'.

□ 8. FAILED PROCESSING
     Upload a non-PDF file to permits bucket (force a processing failure).
     Click "Process" on it.
     Confirm: red Failed badge appears.
     Expand the row → confirm Error Forensics shows human-readable message.

□ 9. FILE TYPE VALIDATION
     Drag an .exe file onto the window.
     Confirm: staging area shows red X with "not accepted" message.
     Confirm: Upload button is disabled for that file.

□ 10. SESSION EXPIRY
      Set a short JWT expiry (or wait).
      Attempt upload with expired session.
      Confirm: redirect to login with "session expired" message.
```

---

## 13. SCHEMA DOC ALIGNMENT — `file_processing_queue`

**v5 problem:** The CMS Schema Documentation (44-table inventory) does not list `file_processing_queue`. The Upload Dashboard spec relies on it heavily. This is either an omission in the schema doc or drift between documents.

**v6 fix:** Acknowledge this explicitly:

> `file_processing_queue` IS a real table in the Supabase database — it was created as part of the Edge Function infrastructure and is documented in the Upload Dashboard spec (v5, lines 89-117). It is NOT in the CMS Schema Documentation's 44-table inventory because that document covers the compliance domain model, not the file processing infrastructure. This is expected, not a conflict. If the schema doc is updated, `file_processing_queue` should be added to a new "FILE PROCESSING INFRASTRUCTURE" section alongside the `documents` and `data_imports` tables.

---

## 14. CLARIFY "SEEDED vs STILL NEEDED" DATA BOUNDARY

**v5 problem:** The Upload Dashboard spec says "all foundational data is already loaded — don't ask for source docs." The CMS Schema Documentation says "What Still Needs Tom's Documents" and lists Consent Decree, Sampling Matrix, permit inventory, and raw lab data as critical gaps. This creates confusion about what's actually ready.

**v6 fix:** Add a reconciliation note:

### Data Readiness — What's True

| Data Layer | Status | Explanation |
|-----------|--------|-------------|
| **Reference data** (states, parameters, roles, orgs, regulatory configs, deadlines) | ✅ Seeded | Static lookup tables. Complete. Do not recreate. |
| **Consent Decree obligations** (75 records) | ✅ Seeded | Obligation tracking structure is loaded. Individual obligation details may need refinement when the actual CD document is reviewed. |
| **Operational data** (permits, outfalls, limits, lab results, sampling schedules, exceedances, DMRs) | ❌ Empty | This is what the Upload Dashboard enables. Zero rows exist. This is correct and expected. |
| **Tom's documents** (CD legal doc, Sampling Matrix, NPDES permits, raw lab data) | ❌ Not yet received | These are the SOURCE DOCUMENTS that users will upload through the Upload Dashboard. The schema doc's "What Still Needs Tom's Documents" section describes what these documents will populate — it does NOT mean the database is broken without them. |

**The Upload Dashboard does NOT need Tom's documents to be built.** It needs them to be USED. Build first, upload second.

---

## UPDATED PROJECT STRUCTURE (additions only)

```diff
  /src
    /components
+     /legal
+       DisclaimerFooter.tsx       ← Persistent short-form footer
+       DisclaimerModal.tsx        ← Full disclaimer text modal
    /hooks
+     useAuditLog.ts              ← Client-side audit trail for exports, bulk actions
+     usePermissions.ts           ← Role-based action gating
+     useUserProfile.ts           ← Current user's org, role, profile data
    /stores
+     verification.ts             ← Per-queue-id extraction verification status
```

---

## UPDATED CONSTRAINTS (additions/modifications only)

Add these to the CONSTRAINTS section:

- Frontend MUST log client-only actions (exports, bulk operations, staging clears) to `audit_log` via `useAuditLog` hook. Fire-and-forget — never block UI.
- Realtime subscriptions MUST be scoped to the current user's organization. Never subscribe to unfiltered table-wide changes.
- Role permissions MUST be enforced in the UI. Unauthorized actions are disabled (grayed + tooltip), never hidden.
- The `other` bucket's accepted file types are restricted in the UI to: PDF, DOCX, XLSX, XLS, CSV, TXT, PNG, JPEG, TIFF. No executables, scripts, or archives.
- AI-extracted permit data MUST display an "Unreviewed" badge until a human marks it verified. This is a UI-only concern (localStorage-backed) — no DB changes required for MVP.
- Software disclaimer (short-form) MUST appear in the app footer. One-liner MUST appear on all exports.
