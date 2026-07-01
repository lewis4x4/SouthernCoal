# SCC Compliance Monitor — Brain Guide

**Version:** 1.2  
**Last updated:** 2026-07-01  
**Orchestrator:** `.cursor/skills/orchestrator/SKILL.md` — continuous build; sub-agents; autonomous git + Supabase deploy  
**Overnight run:** `OVERNIGHT_GOAL.md` (branch `overnight/20260701-goal-pack`)
**Audience:** Brian, AI agents (Cursor, Codex, Claude), contractors  
**Purpose:** Single load-in document — what this system is, how it’s organized, what to build next, and what never to break.

---

## 1. One-sentence mission

Multi-tenant B2B SaaS for **NPDES permit compliance monitoring** for Southern Coal Corporation — coal mining across **AL, KY, TN, VA, WV** under an active **Clean Water Act Consent Decree** (Case 7:16-cv-00462-GEC), with litigation-grade audit trails and EPA/MSHA/OSMRE/state DEP oversight.

This is a **compliance reporting tool**, not an EMS and not legal/environmental consulting. All outputs require independent verification before regulatory submission.

---

## 2. Client & regulatory context

| Dimension | Detail |
|-----------|--------|
| **Primary client** | Southern Coal Corporation (SCC) + 26 subsidiaries |
| **States** | AL (ADEM/E2DMR), KY (KYDEP/NetDMR), TN (TDEC/MyTDEC), VA (DMLR/eDMR), WV (DEP/NetDMR) |
| **Legal frame** | Consent Decree — 75 obligations seeded; immutable audit on every meaningful action |
| **Regulators** | EPA, MSHA, OSMRE, state DEP agencies |
| **Facility scope** | Broad: surface/UG mines, prep plants, refuse, transport, reclamation, NPDES outfalls |

**Daily five questions** (from Coal Mine OS map):

1. Are we **allowed** to operate? (permits, bonds, idle status)
2. Are we operating **safely**? (MSHA, dust, electrical, dams)
3. Are we meeting **environmental/legal obligations**? (water, SMCRA, decree)
4. Are we **making money** without hidden exposure?
5. Are **non-water programs** that can stop mining tomorrow compliant? (air, dams, explosives, FMCSA)

---

## 3. Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | React 19 + TypeScript + Vite |
| Backend | Supabase (PostgreSQL, Auth, Edge Functions, RLS, Realtime, Storage) |
| Cold storage | Cloudflare R2 `scc-compliance-archive` |
| Notifications | Resend (email), Twilio (SMS) |
| State | Zustand (no Redux/Context for global) |
| UI | Tailwind, framer-motion, cmdk, sonner, lucide-react, clsx, tailwind-merge |
| Design | “Living Crystal” glassmorphism — dark base, Satoshi + JetBrains Mono |
| Tests | Vitest |

**Supabase project:** `zymenlnwyzpnohljwifx` — credentials in `.env.local` only (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Never hardcode keys.

**Commands:**

```bash
npm run dev          # local dev server
npm run build        # production build
npm run typecheck    # TypeScript
npm run lint         # ESLint (tsconfigRootDir pinned in eslint.config.js)
npm test             # Vitest (301+ tests)
npm run import:npdes-mappings   # NPDES override import (requires .env.local)
npm run report:npdes-gaps       # Read-only gap report (requires service role key)
```

---

## 4. Two lanes — what to work on

| Lane | Focus | Ordering authority |
|------|-------|-------------------|
| **A — WV field spine** | Field routes, visits, offline sync, evidence, governance hooks | **Codex Handoff** phases 0→10; **Lane A first** policy |
| **B — Compliance platform** | Upload Dashboard, ECHO, DMR pipeline, review queue, alerts | UNIFIED roadmap phases 1–5 |

**Policy:** Lanes A/B/C run **in parallel** per `docs/UNIFIED_MASTER_ROADMAP.md`. Lane A “first” in `plans/LANE_A_FIRST.md` means **QA sign-off order**, not “engineering must stop B/C until A closes.” See `docs/ENGINEERING_FREEDOM.md`.

### Milestone status (Lane A)

| Milestone | Status | Doc |
|-----------|--------|-----|
| **M1** — Online field execution | Code ready; staging A1–A6 sign-off pending | `Roadmap/LANE_A_MILESTONE_1.md` |
| **M2** — Offline sync slice (Codex Phase 4) | **Code shipped** (slices 1–4); **staging B1–B5 QA pending** | `Roadmap/LANE_A_MILESTONE_2.md` |

**M2 automated gate:** `npm test -- milestone2QaCoverage` + map in `src/lib/milestone2QaMap.ts` — see `Roadmap/LANE_A_MILESTONE_2_QA.md` § Automated coverage.

**M2 north star:** A WV sampler can work offline with durable local route/visit data, reconnect without silent data loss, see sync health and blocked-queue reasons, and get conflict holds instead of overwrites.

**M2 code anchors:** `fieldRouteLocalCache`, `fieldVisitLocalCache`, `fieldOutboundQueue`, `FieldDataSyncBar`, `useAuditLog`.

---

## 5. Roadmap document hierarchy

When docs conflict, use this order:

1. **`docs/UNIFIED_MASTER_ROADMAP.md`** — **Build order** — Lanes A/B/C, parallel sequencing
2. **`docs/ENGINEERING_FREEDOM.md`** — **Build authority** — orchestrator mode; autonomous vs hard human gates (supersedes legacy wait/approve language)
3. **`.cursor/skills/orchestrator/SKILL.md`** — **How to run** — sub-agent mesh, infinite loop, git/migrate/deploy protocol
4. **`UNIFIED_ROADMAP.md`** — Hub: task IDs (3.xx, 5.xx), phases 1–5, crosswalk
5. **`Roadmap/SCC Water Sampling Platform — Codex Handoff Roadmap.md`** — **Build sequence** for WV field OS
6. **`Roadmap/SCC_Water_Sampling_Platform_Definitive_Build_Roadmap.md`** — Product depth, acceptance criteria
7. **`SCC_Upload_Dashboard_Handoff_v5.md` + v6 DELTA** — Upload Dashboard spec (Lane B critical path)

**Phase numbers are NOT interchangeable.** Codex Phase 4 (offline) ≠ Definitive Phase 4 (DMR engine).

---

## 6. Architecture — data & tenancy

```
tenant → organization → site → permit → outfall → monitoring point
                              ↘ state (AL/KY/TN/VA/WV)
```

- **46+ RLS-enabled tables**, all access via policies — not app-only checks
- **8 roles** (base) + expanded roles (wv_supervisor, compliance_reviewer, etc.)
- Realtime subscriptions **must** scope to current user's organization
- JWT: call `getFreshToken()` before each upload; redirect to `/login?reason=session_expired` on auth failure

### Seeded / exists (do not recreate)

- 27 organizations, 75 decree obligations, 21 WQ parameters, 5 state configs
- 8 storage buckets with RLS
- Edge Functions (see §8)
- `file_processing_queue`, `work_orders`, `work_order_events`

### NOT populated by design (until Upload Dashboard unlocks)

Permits, outfalls, permit_limits, lab_results, sampling_schedules, exceedances, dmr_submissions — production-shaped WV data is a **blocker** for real field routes.

---

## 7. Frontend map

### Route registration (mandatory pattern)

Every page requires **three** RBAC touchpoints — TypeScript enforces `roles`:

1. `src/lib/rbac.ts` — role group constant
2. `src/App.tsx` — `APP_ROUTES` entry
3. `src/lib/navGroups.ts` — sidebar `NavItem`

Optional: `QuickAccessTiles.tsx`, `Dashboard.tsx` role switch.

### Major route groups

| Area | Paths | Roles (import from rbac.ts) |
|------|-------|----------------------------|
| Dashboard | `/dashboard`, `/search` | ALL_ROLES |
| Upload / compliance | `/compliance`, `/monitoring`, `/obligations` | COMPLIANCE_* |
| Review / ECHO | `/compliance/review-queue`, `/compliance/external-data` | COMPLIANCE_ADVANCED |
| Field (mobile shell) | `/field/route`, `/field/visits/:id`, `/field/dispatch` | FIELD_ROUTE_ROLES |
| Field planning | `/field/schedule`, `/sampling` | FIELD_SCHEDULE_ROLES |
| DMR | `/dmr`, `/dmr/:id` | DMR_SUBMISSION_ROLES |
| Governance | `/governance/issues` | GOVERNANCE_ROUTE_ROLES |
| Admin | `/admin/*`, `/roadmap` | ADMIN_* |
| Audit readiness | `/audit/*` | AUDIT_READINESS_ROLES |

Field routes use `FieldShell`; everything else uses `AppShell`.

### Key lib modules

| Module | Purpose |
|--------|---------|
| `src/lib/constants.ts` | Category mapping (8 doc types) — **never hardcode category strings** |
| `src/lib/rbac.ts` | Role groups — single source of truth |
| `src/lib/queueProcessorRouting.ts` | Upload queue → Edge Function routing |
| `src/lib/fieldOutboundQueue.ts` | Offline field sync queue |
| `src/lib/fieldRouteLocalCache.ts` | IndexedDB route cache |
| `src/lib/fieldVisitLocalCache.ts` | Visit cache (dual-write with route spine) |
| `src/lib/reviewQueueDisplay.ts` | ECHO discrepancy display helpers |
| `src/hooks/useAuditLog.ts` | Client-side audit inserts (fire-and-forget) |

### Document categories (canonical)

| DB Key | Bucket | Label |
|--------|--------|-------|
| `npdes_permit` | `permits` | NPDES Permits |
| `lab_data` | `lab-data` | Lab Data |
| `field_inspection` | `field-inspections` | Field Inspections |
| `quarterly_report` | `quarterly-reports` | Quarterly Reports |
| `dmr` | `dmrs` | DMRs |
| `audit_report` | `audit-reports` | Audit Reports |
| `enforcement` | `enforcement` | Enforcement |
| `other` | `other` | Other |

---

## 8. Edge Functions (repo)

| Function | Purpose |
|----------|---------|
| `file-upload-handler` | Storage ingest (via upload flow) |
| `parse-permit-pdf` | AI permit extraction |
| `parse-parameter-sheet` | Limit sheet parsing |
| `parse-lab-data-edd` | Lab EDD parse |
| `import-lab-data` | Lab data import |
| `import-permit-limits` | Permit limits import |
| `import-netdmr-dmr` | NetDMR DMR import |
| `parse-netdmr-bundle` | NetDMR bundle parse |
| `sync-echo-data` | EPA ECHO sync |
| `detect-discrepancies` | ECHO vs internal discrepancy detection |
| `dispatch-compliance-alerts` | Compliance alert notifications |
| `dispatch-exceedance-alerts` | Exceedance alert notifications |
| `sync-msha-data` | MSHA data sync |
| `sync-precipitation-data` | Weather/precip sync |
| `generate-report` | Report generation |
| `compliance-search` / `document-search` | Search backends |
| `generate-embeddings` / `backfill-embeddings` | Vector search |
| `send-deadline-alert` | Deadline notifications |
| `process-handoff` | Handoff processing |
| `generate-corrective-action-pdf` | CA PDF export |
| `generate-precipitation-evidence-pdf` | Rain event evidence PDF |
| `report-status` | Report status |

Shared logic lives in `supabase/functions/_shared/`.

---

## 9. Non-negotiable constraints

### Legal / audit

- Every data entry, edit, deletion, and export → **immutable audit trail**
- Frontend MUST log client-only actions via `useAuditLog` (exports, bulk ops, filter changes, sync actions)
- Fire-and-forget — never block UI on audit failure

### Database & backend (per `docs/UNIFIED_MASTER_ROADMAP.md`)

- **Add migrations, tables, RPCs, and Edge Functions as the build requires** — no pre-approval gate. Extend the spine; do not rebuild Module 1 from scratch.
- New tables: RLS enabled, org-scoped policies, follow existing migration naming and patterns
- **DO NOT** drop or alter production-critical seeded data without explicit human sign-off
- **DO NOT** modify existing **storage bucket** policies without review — buckets are shared infrastructure
- Verify table/function counts in repo + Supabase — planning doc numbers are not authoritative

### Security

- RLS at database level — UI disables unauthorized actions (grayed + tooltip), never hides them
- Tenant → org → site → state → permit scoping on all queries
- No secrets in code or git

### Upload Dashboard rules

- AI extraction trust badges: Unreviewed / In Review / Verified / Disputed (UI-only MVP in Zustand + localStorage)
- `other` bucket: PDF, DOCX, XLSX, XLS, CSV, TXT, PNG, JPEG, TIFF only — block executables/archives
- Export disclaimer one-liner on all CSV/markdown/PDF exports

### Build discipline

- One bounded change at a time — no unrelated refactors
- Do not over-engineer or add unrequested abstractions
- Explore → Plan → Implement → Verify (typecheck + lint)

---

## 10. Coal Mine OS vision (long-term)

Beyond water compliance, SCC is mapped as a **46-module operating system** with ~120 agent opportunities:

- **Reference:** `Roadmap/SCC_Coal_Mine_OS_Modules_and_Agents.md`
- **Master map:** `Justice_App/GPT.md` + `Justice_App/SCC_Coal_Business_Comprehensive_Function_Inventory.md`

Modules span executive command, permits, sampling, lab/DMR, exceedances, force majeure, MSHA, production, land, finance, legal/EMS, and IT. Agents always have **human gates** on legally meaningful decisions (FM, DMR certification, shutdown, bond release).

This is **directional product vision** — current engineering executes Lane A + Lane B slices, not all 46 modules at once.

---

## 11. Recently shipped (2026-07-01 overnight branch)

| Package | Highlights |
|---------|------------|
| **Lane A M2** | Offline route/visit dual-write cache, sync UX, conflict holds |
| **M2 QA automation** | `milestone2QaMap.ts`, B1–B5 Vitest map, Audit Log conflict-hold preset |
| **Upload queue** | `queueProcessorRouting`, `useQueueProcessing` (permit / sheet / lab / NetDMR) |
| **Alerts** | Compliance + exceedance dispatch functions, rules panels, weekly digest cron SQL |
| **ECHO / review** | `SyncHealthPanel`, discrepancy detection, weekly ECHO cron SQL |
| **DMR** | `import-netdmr-dmr`, shared `netdmr-parse`, submission UI hooks |
| **Tooling** | ESLint worktree fix, NPDES import/gap scripts |

**Still human-gated:** M1/M2 staging sign-off, prod migration apply, NPDES `--apply` to prod.

---

## 12. Completed platform milestones (Lane B highlights)

From live `roadmap_tasks` (org `2bffc35c-e2c4-4396-868f-207f80e1e2c4`):

- **3.49–3.52** — ECHO sync pipeline, full sync (153/154 permits, 289K+ DMRs, 144K+ discrepancies), Layer 2 audit fixes
- Upload Dashboard UI — in progress (critical path for data population)
- Review queue, exceedance/compliance alert panels — recent additions in working tree

---

## 13. Agent operating instructions

### Session start checklist

1. Read this Brain Guide
2. Read `docs/ENGINEERING_FREEDOM.md` and `.cursor/skills/orchestrator/SKILL.md`
3. Check `git status` and `Roadmap/LANE_A_MILESTONE_2.md` for active work
4. Confirm lane scope from `docs/UNIFIED_MASTER_ROADMAP.md` (default: parallel A/B/C unless Brian narrows)
5. Execute orchestrator loop — commit/push/merge/deploy autonomously when verify passes. **Never end a turn with only "next up is …"** — chain the next slice in the same turn (see `.cursor/rules/no-end-turn-without-next-slice.mdc`).

### Workflow for new features

```
Explore (sub-agents if large) → Implement → typecheck + lint + test + build → commit + push + merge + migrate/deploy → next item
```

Hard human gates (external submit/certify, destructive prod DDL, verified-dollar sign-off, secrets): **stop** — see `docs/ENGINEERING_FREEDOM.md`. Git, additive migrations, and Edge Function deploy are **autonomous**.

### RBAC checklist (every new page)

- [ ] Role group in `rbac.ts`
- [ ] Route in `APP_ROUTES` with `roles`
- [ ] Nav item in `navGroups.ts` with `roles`
- [ ] Dashboard/tiles if applicable

### Sub-agent gates (from System Prompts)

| Change type | Gate |
|-------------|------|
| Any segment | QA |
| UI/UX/copy | Design review |
| Workflows, parsers, state | Chaos/testing |
| Auth, RLS, secrets | Security |
| Bundle, queries, datasets | Performance |
| Schema/migrations | Migration integrity |

---

## 14. Key reference files (read when touching…)

| File | When |
|------|------|
| `OVERNIGHT_GOAL.md` | Autonomous run tracking / morning checklist |
| `CLAUDE.md` (parent dir) | Non-negotiable rules — read with this guide |
| `UNIFIED_ROADMAP.md` | Task IDs, phase crosswalk |
| `SCC_Upload_Dashboard_Handoff_v5.md` | Any dashboard/upload work |
| `SCC_Upload_Dashboard_Handoff_v6_DELTA.md` | RLS, RBAC, audit, categories |
| `Roadmap/LANE_A_MILESTONE_2.md` | Current Lane A work |
| `docs/field-offline-qa.md` | Offline/sync QA |
| `docs/NPDES_MAPPING_CLEANUP_BACKLOG.md` | NPDES override gaps |
| `src/types/database.ts` | Table types for queries |
| `CMS_Schema_Documentation.docx` | Full schema (44+ tables) |

---

## 15. Common pitfalls

| Symptom | Likely cause |
|---------|--------------|
| Empty state on field pages | Missing production WV data; RLS misconfig; relying on `npdes_permits.state_code` alone — use `sites.state_id` + `states.code` fallback |
| “Complete” Phase 4 assumed | M2 is a **slice** — full airplane-mode day not certified yet |
| Category bugs | Hardcoded string instead of `CATEGORIES` from `constants.ts` |
| Silent sync overwrite | Must use conflict hold + audit, not auto-merge |
| Build error on new route | Missing `roles` on RouteConfig or NavItem |
| Session expired mid-upload | Token cached across uploads — refresh per file |

---

## 16. Glossary

| Term | Meaning |
|------|---------|
| **DMR** | Discharge Monitoring Report — monthly/quarterly permit reporting |
| **ECHO** | EPA Enforcement and Compliance History Online |
| **EDD** | Electronic Data Deliverable — lab result file format |
| **NPDES** | National Pollutant Discharge Elimination System |
| **NetDMR** | Web portal for DMR submission (KY, WV) |
| **Outfall** | Permitted discharge point |
| **RLS** | Row Level Security — Postgres policy layer |
| **FM** | Force Majeure — regulatory exception for missed sampling |
| **Lane A / B** | WV field spine vs compliance platform workstreams |
| **Living Crystal** | UI design system — glassmorphism, dark, cursor-tracking cards |

---

## 17. Quick decision tree

```
User asks for a change
  ├─ Hard human gate? (external submit/certify, destructive DDL, verified dollars, secrets) → STOP — ENGINEERING_FREEDOM.md
  └─ Else → orchestrator loop (sub-agents → build → verify → commit/push/merge → db push/functions deploy → next item)
  ├─ New DB table/migration/Edge Function? → BUILD (RLS + audit + RBAC)
  ├─ Field/offline/sync? → Lane A, check M2 acceptance criteria
  ├─ Upload/ECHO/DMR/review queue? → Lane B, check v5+v6 handoff
  ├─ Detection/parsers/ledgers/MSHA? → Lane C, UNIFIED_MASTER_ROADMAP
  ├─ New page/route? → RBAC three-file checklist
  └─ UI only, no domain logic? → Match Living Crystal, run typecheck
```

---

*Generated for SCC Compliance Monitor. Update this guide when milestones close or lane policy changes.*
