# Lane C MSHA — Pipeline activation verification (2026-07-01)

**Spec:** `docs/UNIFIED_MASTER_ROADMAP.md` §3 (Build now — MSHA pipeline body)  
**Route:** `/compliance/external-data` → MSHA tab  
**Automated gate:** `npm run qa:msha` — pass (9 tests)

## Already shipped (migrations + edge functions)

| Layer | Artifact |
|-------|----------|
| DB | `20260701170000` — abatement columns, unique key, `get_msha_abatement_at_risk`, weekly cron |
| DB | `20260701180000` — `msha_mine_org_map` + 106 active mine seeds, map refresh crons |
| EF | `sync-msha-data` — OGD Violations.zip stream + upsert |
| EF | `refresh-msha-mine-map` — self-healing map from Mines.zip |
| UI | `MshaCoveragePanel` — map stats, sync buttons, abatement-at-risk list |
| Nav | Compliance → **ECHO Data** (`COMPLIANCE_ADVANCED_ROLES`) |

## Activation slice (this session)

| Step | Result |
|------|--------|
| Prod migrations | Applied — **106** active mines in `msha_mine_org_map` |
| UAT seed | `scripts/seed-msha-uat-violations.sql` — 2 open citations on UAT org |
| Abatement RPC | **2 rows** (1 overdue + 1 due within 14 days) |

### UAT citations (org `f0000001…`, mine `4602380`)

| Violation | Abatement due | Urgency |
|-----------|---------------|---------|
| UAT-VIO-001 | 10 days ago | **overdue** |
| UAT-VIO-002 | +5 days | **due_soon** |

## Manual smoke

1. Log in as `wv-uat-admin@invalid.scc.local` on Netlify.
2. Open `/compliance/external-data` → **MSHA** section.
3. Confirm map shows **106** active mines (global SCC map, not UAT-only).
4. Abatement panel — 2 UAT rows for org-scoped view.
5. Optional: **Sync violations** triggers live OGD download (admin; may take 30–60s).

## Empty-state behavior (production SCC)

Mine map is populated (106 mines). Violation rows fill on first successful `sync-msha-data` run or remain empty until sync — abatement panel shows green empty copy. All outputs are **DRAFT operational aids**, not legal conclusions.

## Lane C backlog — remaining

| Item | Status | Next slice |
|------|--------|------------|
| **MSHA** | Activated (this doc) | Optional: wire MSHA rules in `detect-discrepancies` |
| **VA/TN parsers** | Parse ✅, import ❌ | Shared outfall/parameter enrichment in import path |
| **AL parser** | Parse ✅, import ❌ | Same enrichment hook |
| **Penalty ledger** | Code + migration ✅ | `qa:penalty-ledger` gate + UAT smoke on `/compliance/penalty-ledger` |
