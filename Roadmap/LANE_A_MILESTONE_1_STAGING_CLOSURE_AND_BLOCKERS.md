# Lane A Milestone 1 — Staging QA runbook, closure, and real-world blocker intake

**Companion docs:** [`LANE_A_MILESTONE_1.md`](./LANE_A_MILESTONE_1.md) (acceptance criteria), [`LANE_A_MILESTONE_1_QA.md`](./LANE_A_MILESTONE_1_QA.md) (short checklist).  
**Purpose:** Execute **A1–A6** in **staging**, record evidence, **close Milestone 1** or **file gaps**, and collect everything needed to remove **real-world blockers** so Milestone 1 is **100% defensible**.

**Staging base URL:** _fill, e.g._ `https://staging.example.com`  
**Supabase project (staging):** _fill project ref / URL_  
**Tester:** _______________ **Date:** _______________ **Build / commit:** _______________

---

## 0. What this session did not do

QA in a real browser against **your** staging tenant was **not** executed from the repo. This file is the **worksheet and intake guide**. After you run the steps below, fill **Pass / fail / notes**, attach evidence, and complete **Sign-off**.

---

## 1. Preconditions (record before testing)

| # | Check | Done | Notes |
|---|--------|------|-------|
| P1 | Staging deploy matches `main` (or tagged release) you intend to certify | [ ] | Commit: ________ |
| P2 | Test user has a **field-capable** role (`field_sampler`, `site_manager`, `environmental_manager`, `executive`, or `admin` per `App.tsx` `FIELD_ROUTE_ROLES`) | [ ] | User id: ________ |
| P3 | Test user’s `user_profiles.organization_id` is the org that owns **WV dispatch data** | [ ] | Org id: ________ |
| P4 | Dispatch filter uses **`WV`** in code (`FIELD_DISPATCH_STATE_CODE` in `src/lib/fieldOpsConstants.ts`) — staging data must include **WV** permits/sites/outfalls/schedules as needed for routes | [ ] | |
| P5 | At least one visit is **assigned** or **in progress** on **today’s route** for that org (or you can create one via supervisor/calendar flows) | [ ] | Visit id(s): ________ |
| P6 | Browser: geolocation allowed **or** you will use **manual** lat/long only | [ ] | |
| P7 | For **A6**: device can enable **airplane mode** or you use DevTools **offline** + confirm sync when back online | [ ] | |

**Deep links (adjust origin):**

| Screen | Path |
|--------|------|
| Field dispatch | `/field/dispatch` |
| Today’s route | `/field/route` |
| Visit execution | `/field/visits/{visit_id}` |
| Audit Log (if role allows) | `/compliance/audit-log` or equivalent in your nav |

---

## 2. A1 — Today’s route

| Step | Expected | Pass | Notes / evidence |
|------|----------|------|------------------|
| Open `/field/dispatch` | WV (or configured) filter loads; **no** spurious empty error when data exists | [ ] | |
| Open `/field/route` | Stop list matches **today** for the test org | [ ] | Screenshot / list count: ____ |
| Open a visit from that list | `FieldVisitPage` loads; **not** “Field visit unavailable” | [ ] | Visit id: ____ |

**Fail → gap ticket:** use **Template G1** (Section 6).

---

## 3. A2 — Outcome evidence gates

For **one visit** (or spot-check three), try **Complete** with invalid data, then valid.

| Outcome | Negative test (must block) | Positive test (must allow after fix) | Pass | Notes |
|---------|-----------------------------|--------------------------------------|------|-------|
| Sample collected | Missing container ID / preservative / outlet flow “unknown” blocks | All required fields set → can complete | [ ] | |
| No discharge | No photo / no narrative / obstruction without details blocks | Photos + narrative (+ obstruction detail if checked) | [ ] | |
| Access issue | No photo / no narrative blocks | Photo + access narrative | [ ] | |
| All | Toasts explain **why** blocked (compliance-oriented) | | [ ] | |

**Fail → gap ticket:** **Template G2**.

---

## 4. A3 — GPS at complete

| Step | Expected | Pass | Notes |
|------|----------|------|-------|
| Clear lat/long (or invalid) and attempt complete | Blocked with clear messaging | [ ] | |
| Use **Use my location** or enter valid coords | Fields populate; complete allowed when A2 satisfied | [ ] | |

**Fail → gap ticket:** **Template G3**.

---

## 5. A4 — Online RPC

**Condition:** Network **on**; not forcing offline queue.

| Step | Expected | Pass | Notes |
|------|----------|------|-------|
| Complete visit successfully | UI shows **completed**; refresh persists state | [ ] | |
| Inspect DB | Row in `field_visits` (or your canonical table) reflects completion | [ ] | |
| Force error (optional: invalid payload via devtools only if safe) | Toast shows `complete_field_visit` failure, **not** silent | [ ] | |

**SQL (staging — adjust table/columns to match your schema):**

```sql
-- Replace VISIT_UUID
SELECT id, status, completed_at, updated_at
FROM field_visits
WHERE id = 'VISIT_UUID';
```

**Fail → gap ticket:** **Template G4**.

---

## 6. A5 — Client audit

| Step | Expected | Pass | Notes |
|------|----------|------|-------|
| After **online** complete | `audit_log.action` = **`field_visit_completed`** for this user/session | [ ] | |
| After **offline / queued** complete (before sync, if observable) | **`field_visit_completion_queued`** | [ ] | |

**SQL (staging):**

```sql
-- Replace USER_UUID and time window
SELECT id, action, description, created_at
FROM audit_log
WHERE user_id = 'USER_UUID'
  AND action IN ('field_visit_completed', 'field_visit_completion_queued')
  AND created_at > now() - interval '2 hours'
ORDER BY created_at DESC
LIMIT 20;
```

**Fail → gap ticket:** **Template G5**.

---

## 7. A6 — Offline queue

| Step | Expected | Pass | Notes |
|------|----------|------|-------|
| Airplane mode / offline | Complete still **queues**; user sees sync-oriented feedback | [ ] | |
| Back online | `FieldDataSyncBar` (or queue) **processes**; visit + audit eventually consistent | [ ] | |
| No silent loss | Compare queued count / visit id before and after | [ ] | |

**Fail → gap ticket:** **Template G6**.

---

## 8. Milestone 1 closure decision

| Criterion | Pass |
|-----------|------|
| A1 | [ ] |
| A2 | [ ] |
| A3 | [ ] |
| A4 | [ ] |
| A5 | [ ] |
| A6 | [ ] |

- **All six pass** → Milestone 1 **accepted** for this environment. Update [`LANE_A_MILESTONE_1.md`](./LANE_A_MILESTONE_1.md) implementation section if you maintain a formal “closed on {date}” line; plan **Milestone 2** (Codex Phase 4 offline slice) per that doc.
- **Any fail** → **Do not** claim 100% complete. File gaps using Section 9 templates; re-run after fixes.

**Sign-off**

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product / ops | | | |
| Environmental lead (optional) | | | |

---

## 9. Gap ticket templates (copy to Linear / Jira / GitHub)

**G1 — A1 route / dispatch**

```
Title: [Lane A M1] A1 fail: today’s route / dispatch / visit load
Env: staging | Org: | User: | Visit:
Expected: …
Actual: …
Evidence: screenshots, console errors, network failed requests
```

**G2 — A2 evidence gates**

```
Title: [Lane A M1] A2 fail: outcome evidence validation
Outcome: sample_collected | no_discharge | access_issue
Expected block/allow: …
Actual: …
```

**G3 — A3 GPS**

```
Title: [Lane A M1] A3 fail: GPS / lat-long gating
…
```

**G4 — A4 RPC**

```
Title: [Lane A M1] A4 fail: complete_field_visit online path
Error text / toast / Postgres: …
```

**G5 — A5 audit**

```
Title: [Lane A M1] A5 fail: client audit_log for field completion
Missing action: field_visit_completed | field_visit_completion_queued
SQL snippet / screenshot of audit_log row: …
```

**G6 — A6 offline**

```
Title: [Lane A M1] A6 fail: offline queue / sync bar
Steps to reproduce: …
Data loss? yes/no
```

---

## 10. Real-world blocker intake — data to gather for “100% Milestone 1”

Use this so **staging sign-off** translates to **production confidence**. Check items off as SCC / IT / you collect them.

### 10.1 Production-shaped WV field data (highest leverage)

| Item | Why it matters for M1 | Owner | Status | Notes / location |
|------|------------------------|-------|--------|------------------|
| Active **WV** `npdes_permits` (+ sites) aligned to real operations | A1 route stops are credible | SCC / data | [ ] | |
| **Outfalls** (or monitoring points) tied to those permits | Dispatch + visit context | SCC / data | [ ] | |
| **Sampling schedules** / calendar inputs that generate **today’s** work | A1 “today’s route” matches reality | SCC / ops | [ ] | |
| **Field visit** rows in **assigned / in progress** for test dates | QA can run without seed hacks | Ops / admin | [ ] | |
| Single **golden path** written down: org id, permit ids, visit id for demos | Repeatable UAT | You | [ ] | |

### 10.2 Identity, RLS, and environment

| Item | Gather | Status |
|------|--------|------|
| Staging **and** prod: `VITE_SUPABASE_URL`, anon key in **hosting** only | Confirm not committed | [ ] |
| Test accounts per role (sampler, site mgr, read-only **cannot** access `/field/*`) | User ids recorded | [ ] |
| Confirm JWT can `SELECT` chains: `sites`, `states`, `npdes_permits`, `field_visits`, `outfalls` | Run read-only queries as test user or document RLS policy names | [ ] |
| `FIELD_DISPATCH_STATE_CODE` remains **`WV`** until product explicitly multi-states dispatch | Engineering decision logged | [ ] |

### 10.3 Devices and offline policy

| Item | Gather | Status |
|------|--------|------|
| Target devices (iOS Safari / Android Chrome / rugged tablet) | List | [ ] |
| Geolocation policy (permissions, MDM blocks) | IT statement | [ ] |
| Offline test procedure approved (airplane mode on production pilot or staging only) | Ops sign-off | [ ] |

### 10.4 Program track (parallel — does not replace M1 code)

Per [`UNIFIED_ROADMAP.md`](../UNIFIED_ROADMAP.md) Phases **1–2**: org roster, permits matrix, lab samples — **not** required to pass A1–A6 in staging, but required for **real-world** “done” narrative under consent-decree oversight.

| Track | Example artifacts | SCC owner |
|-------|-------------------|-----------|
| Phase 1 | Named environmental roles per site, sampling matrix | Management |
| Phase 2 | Permit inventory completeness, lab EDD samples | Management + labs |

### 10.5 After M1 — explicit non-goals (until Milestone 2)

- Full **airplane-mode all-day** + **conflict resolution** + **sync audit** depth = **Codex Phase 4** / proposed **Milestone 2**.
- DMR auto-calc, ECHO triage = **Lane B** unless blocking WV data.

---

## 11. Verification commands (engineering sanity before UAT)

```bash
cd "/path/to/SouthernCoal"
npm run typecheck
npm run lint
npm run test
```

Field-related automated tests include `fieldVisitCompletionValidation`, `useFieldOps`, `FieldDataSyncBar`, `FieldVisitPage` (note: existing `act()` warnings in `FieldVisitPage` test — informational only unless you tighten tests).

---

## 12. One-page “Milestone 1 = 100% complete” definition

Milestone 1 is **100% complete** when:

1. **A1–A6** are **Pass** on an agreed **staging** (or pilot) environment with evidence attached to this worksheet **or** the short [`LANE_A_MILESTONE_1_QA.md`](./LANE_A_MILESTONE_1_QA.md) sign-off.  
2. **Gap tickets** from any failure are **closed** or explicitly **waived** in writing with risk owner.  
3. **Section 10** items needed for **your** production rollout are **tracked** (they can finish after M1 code sign-off, but “100% real world” means data + identity + device policy are not hand-waved).

---

*Last updated: worksheet created for Milestone 1 staging closure and blocker intake.*
