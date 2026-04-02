# Field Ops offline — manual QA checklist

Use this after changes to auth, permissions, field caches, or the outbound queue. Run in **production build** (`npm run build` + `npm run preview`) when verifying the service worker; dev mode does not register the PWA worker.

## Preconditions

- Log in as a user with `FIELD_ROUTE_ROLES` (e.g. field sampler).
- Open **Today’s Route** online at least once; use **Save route offline** so IndexedDB/localStorage has a snapshot.
- Open one or more **visit** screens online so per-visit cache is warm (optional but realistic).

## Scenarios

### 1. Cold start while offline (valid session on device)

1. While online, confirm the app loads and field pages work.
2. Disable network (airplane mode or offline in DevTools).
3. Close the tab completely; open the same origin again (or refresh).
4. **Expect:** Not bounced to login if the stored access token is still valid (`useAuth` falls back to local JWT when refresh fails).
5. **Expect:** Field routes remain reachable if role assignments are still readable from cache (`usePermissions` — up to 72h online staleness; unbounded age while `navigator.onLine` is false).

### 2. Route list offline

1. From **Today’s Route**, save an offline copy while online.
2. Go offline; reload the route page.
3. **Expect:** Stops list and banners match [FieldDataSourceBanner](src/components/field/FieldDataSourceBanner.tsx) / [FieldRouteTodayPage](src/pages/FieldRouteTodayPage.tsx) copy (cached copy, sync when back online).

### 3. Visit flow + outbound queue

1. Offline (or simulate failed fetch), start a visit, add measurements / inspection / completion as your test user allows.
2. **Expect:** Toasts or UI indicate **queued** actions where appropriate; [FieldDataSyncBar](src/components/field/FieldDataSyncBar.tsx) shows pending count.
3. Go online; use **Refresh** / sync behavior on the visit or route screen.
4. **Expect:** [fieldOutboundQueue](src/lib/fieldOutboundQueue.ts) flushes (`processFieldOutboundQueue`); pending count drops; server reflects data.

### 4. Offline evidence (photos)

1. Capture evidence offline (or with upload failing).
2. **Expect:** Drafts persist (IndexedDB) and failures surface in the sync bar per [fieldEvidenceDrafts](src/lib/fieldEvidenceDrafts.ts).
3. Reconnect and sync.
4. **Expect:** Uploads complete or actionable error messages remain.

### 5. Reconnect

1. After offline edits, enable network.
2. **Expect:** `online` event triggers session refresh ([useAuth](src/hooks/useAuth.ts)) and role refetch ([usePermissions](src/hooks/usePermissions.ts)); field flush runs when the UI requests it.

### 6. Conflict hold (narrow cases)

1. Exercise scenarios documented in [fieldOutboundQueue.ts](src/lib/fieldOutboundQueue.ts) (e.g. server visit already completed with a different outcome than the queued completion).
2. **Expect:** Queue diagnostic / toast; conflict hold messaging in [FieldDataSyncBar](src/components/field/FieldDataSyncBar.tsx); no silent overwrite of disposition.

### 7. Expired JWT offline

1. Use a session past `expires_at` (or wait until expiry) with refresh impossible offline.
2. **Expect:** Auth status **expired**, redirect to login when guards run — API calls cannot be trusted without a valid access token.

## Automated tests (reference)

- [useAuth.test.tsx](src/hooks/__tests__/useAuth.test.tsx) — local JWT fallback, expiry, `online` refresh.
- [usePermissions.test.tsx](src/hooks/__tests__/usePermissions.test.tsx) — 72h staleness, offline cache retention.
- [useFieldOps.test.tsx](src/hooks/__tests__/useFieldOps.test.tsx) — offline visit hydration.
- [fieldOutboundQueue.test.ts](src/lib/__tests__/fieldOutboundQueue.test.ts) — queue FIFO, flush, conflict holds.

---

## Non-field / full-app offline (out of scope)

**Upload Dashboard, executive dashboards, global search, and most non-field routes are online-first.** They rely on live Supabase (and related services) and do not implement a general offline read cache or write queue.

Delivering **full-app offline** would need explicit product decisions: what to cache per tenant, how queued writes are audited and reconciled, and UX for conflict and stale data. That work is **deferred** unless product approves scope and audit UX.
