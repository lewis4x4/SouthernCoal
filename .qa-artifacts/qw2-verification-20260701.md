# Lane C QW2 — ¶49 EDD clock + exceedance-only verification (2026-07-01)

**Spec:** `docs/QUICK_WINS.md` §QW2, `docs/UNIFIED_MASTER_ROADMAP.md` §3  
**Route:** `/compliance/late-incomplete-edd`  
**Automated gate:** `npm run qa:qw2` — pass (5 tests)

## Already shipped (commit `5417609`)

| Layer | Artifact |
|-------|----------|
| DB | `20260701130000_edd_paragraph49_evaluation.sql` — table, RPCs, RLS |
| UI | `LateIncompleteEddPage` + summary cards, filter tabs, triage panel |
| Nav | Compliance → **Late / Incomplete EDD** (`COMPLIANCE_ADVANCED_ROLES`) |
| Ingest hook | `import-lab-data` EF calls `evaluate_edd_import_paragraph49` after import |
| Audit | `edd_paragraph49_evaluated` + `edd_paragraph49_review_updated` in `audit_log` |

## Bug fix + activation (this session)

| Step | Result |
|------|--------|
| Root cause | RPC referenced `data_imports.organization_id` — column does not exist |
| Fix migration | `20260702140000_qw2_fix_paragraph49_org_resolution.sql` — applied prod |
| Org resolution | `lab_results → sampling_events → outfalls → npdes_permits/sites`, fallback `data_imports.site_id → sites` |
| UAT seed | `scripts/seed-qw2-uat-edd-flags.sql` — 2 imports evaluated via RPC |
| Seed note | Exceedances auto-created by `trg_detect_exceedance` (no manual insert) |

### Evaluations (UAT org `f0000001…`)

| File | Flag | Hours | Received / Expected | Exceedances |
|------|------|-------|---------------------|-------------|
| `qw2-uat-late.edd` | **Late >48h** | ~120+ | 1 / 5 | 0 |
| `qw2-uat-exceedance-only.edd` | **Exceedance-only** | ~20 | 2 / 5 | 2 |

## Manual smoke

1. Log in as `wv-uat-admin@invalid.scc.local` on Netlify.
2. Open `/compliance/late-incomplete-edd` — confirm 2 rows + DRAFT disclaimer banner.
3. Filter tabs: **Late >48h** (1), **Exceedance-only** (1), **All flags** (2).
4. Select a row → triage to **Acknowledged** (requires `verify` permission).

## Empty-state behavior (production SCC)

No lab imports until Upload Dashboard lands — page shows empty-state copy. Flags are advisory only; no penalty dollars asserted.

## Next (Lane C)

**QW4** — Overdue field-sampling equipment PM detector.
