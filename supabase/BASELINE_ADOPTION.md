# Baseline Snapshot Adoption Runbook — SCC prod DB `zymenlnwyzpnohljwifx`

**Goal:** make the committed migration history finally equal the live production schema, so
`supabase db reset` replays cleanly and there is a single source of truth.

**Why this is needed (see the source-of-truth audit, 2026-05-31):**
- The committed migrations are **not a from-zero replayable history** — the foundational tables
  (`organizations`, `sites`, `user_profiles`, `outfalls`, `npdes_permits`, `parameters`,
  `data_imports`, `precipitation_events`, …) have **no committed `CREATE TABLE`**. The earliest
  migration (`20260209170001_upload_dashboard_rls.sql`) only adds RLS to pre-existing tables.
- The live `lab_results` / `sampling_events` schema **drifted** from the committed CREATE
  (`is_non_detect`/`analyzed_date`/`hold_time_met`/`result_text`/`site_id`/`status` live, vs.
  committed `below_detection`/`analysis_date`/`hold_time_compliant`/`organization_id`) via
  uncommitted out-of-band edits.
- **Two repos deploy to this one DB**: `SouthernCoal` (111 migrations, 24 functions — canonical
  backend) and `scc-os` (8 migrations + 5 functions — greenfield frontend overlay). Their changes
  share one `supabase_migrations.schema_migrations` ledger.

A real `supabase db dump` of prod, adopted as the **single baseline migration** (replacing the
drifted/incomplete history), is the only clean fix.

A reference dump is already staged: **`supabase/baseline/2026-05-19_production_public_schema.reference.sql`**
(167 tables, 464 policies, 111 functions, 439 indexes — a real `supabase db dump --schema public`
of this exact project, but **~2 weeks stale**: it predates `20260524*` crons and the
`20260531120000` reconciliation, and it already contains scc-os's overlay objects). Use it only as
a format reference — **regenerate a fresh dump (Step 2) before adopting.**

---

## PREREQ 0 — Freeze scc-os DDL first
Per the audit, stop all `supabase db push` / `migration` from `scc-os/`. scc-os keeps frontend
authority but loses DDL authority; SouthernCoal becomes the canonical migration source. Otherwise
the baseline drifts again immediately.

## PREREQ 1 — Authenticate to the CORRECT Supabase account ⚠️
The local CLI is currently logged into a **different account** than the one that owns this project.
`supabase projects list` does **not** show `zymenlnwyzpnohljwifx`; the project lives in org
`juclqvizrlhogvdgoqqg` ("blewis@lewisinsurance.com's Project"), visible only via the management API
token the MCP uses. Before dumping you must either:

```bash
# option A: log in interactively as the account that owns org juclqvizrlhogvdgoqqg
supabase login                      # run as `! supabase login` so it's interactive in-session

# option B: export a personal access token for that account
export SUPABASE_ACCESS_TOKEN=<token-for-org-juclqvizrlhogvdgoqqg>
```

You also need the project's **database password** for `db dump` (Dashboard → Project Settings →
Database → reset/copy password if unknown). The linked `supabase/.temp/pooler-url` has **no**
embedded password.

Confirm access before proceeding:
```bash
cd "/Users/brianlewis/Southern Coal/SouthernCoal"
supabase projects list | grep zymenlnwyzpnohljwifx   # must now appear
```

---

## STEP 1 — Tag current state (safety)
```bash
cd "/Users/brianlewis/Southern Coal/SouthernCoal"
git switch -c chore/baseline-prod-schema
supabase migration list --linked > supabase/baseline/REMOTE_LEDGER_BEFORE.txt   # snapshot remote ledger
```

## STEP 2 — Generate a FRESH dump of the live public schema
```bash
TS=20260209000000   # earliest timestamp so the baseline sorts FIRST in migrations/
supabase db dump --linked --schema public \
  -f "supabase/migrations/${TS}_baseline_production_public_schema.sql"
# (the 2026-05-19 reference used exactly: supabase db dump --linked --schema public)
```
Sanity-check it resembles the reference (CREATE SCHEMA public; 160+ tables; RLS policies present):
```bash
grep -c '^CREATE TABLE'  "supabase/migrations/${TS}_baseline_production_public_schema.sql"   # ~167
grep -c '^CREATE POLICY' "supabase/migrations/${TS}_baseline_production_public_schema.sql"   # ~464
```

## STEP 3 — Archive the drifted/incomplete history (do NOT delete)
```bash
mkdir -p supabase/migrations_archive
# move every PRE-baseline migration out of the active path, keeping the new baseline:
git mv supabase/migrations/2026020*.sql supabase/migrations/2026021*.sql \
       supabase/migrations/2026022*.sql supabase/migrations/2026023*.sql \
       supabase/migrations/2026030*.sql supabase/migrations/2026040*.sql \
       supabase/migrations/2026050*.sql supabase/migrations_archive/ 2>/dev/null
# IMPORTANT: do NOT move the new ${TS}_baseline...sql (it shares the 20260209 prefix — verify):
ls supabase/migrations/   # should show ONLY the baseline (+ anything you intend to keep on top)
```
This retires, among others, the obsolete `20260217170009_create_lab_results.sql` and makes the
`20260531120000_reconcile_*` migration **redundant** (the baseline already has the reconciled
shape) — archive it too. Also archive the 8 `scc-os` migrations once you confirm they're captured
in the dump (`roadmap_sync_events`, `sample_storet_parameters`, `require_coc_scans`, etc. — they
were applied by ~May 20, so a fresh dump includes them).

## STEP 4 — Reconcile the REMOTE ledger to the baseline
The remote `schema_migrations` still lists every old version. Tell Supabase the baseline is the
applied state and the old per-file versions are no longer tracked:
```bash
supabase migration list --linked          # list remote applied versions
# mark the baseline as already applied on remote (its DDL already exists in prod):
supabase migration repair --status applied 20260209000000
# mark each archived version as reverted so the CLI stops expecting their files:
#   (scripted over the versions captured in REMOTE_LEDGER_BEFORE.txt)
for v in $(awk 'NR>2 {print $1}' supabase/baseline/REMOTE_LEDGER_BEFORE.txt | grep -E '^[0-9]{14}$' | grep -v '^20260209000000$'); do
  supabase migration repair --status reverted "$v"
done
supabase migration list --linked          # should now show only the baseline as applied
```
> No DDL runs against prod here — `repair` only rewrites the migration bookkeeping table. Prod data
> and schema are untouched.

## STEP 5 — Verify a clean replay locally
```bash
supabase db reset                          # replays ONLY the baseline into the local shadow DB
supabase db diff --linked --schema public  # expect: "No schema changes found" (local == prod)
```
If `db diff` shows differences, fold them into a single follow-up migration on top of the baseline
and re-verify. Then run the app's test suite against the reset DB.

## STEP 6 — Land it
```bash
git add -A && git commit -m "chore(db): adopt production schema baseline; archive drifted history"
# open PR; after review, future changes are ordinary migrations on top of the baseline.
```

---

## After adoption
- `20260217170009_create_lab_results.sql` and `20260531120000_reconcile_lab_results_sampling_events_to_production.sql`
  live in `migrations_archive/` (their effect is subsumed by the baseline).
- New schema changes: one migration per change, timestamp `> 20260209000000`, pushed only from
  SouthernCoal.
- Re-baseline (repeat this runbook) whenever drift is suspected — but with PREREQ 0 enforced, it
  shouldn't recur.
- Delete the stale `supabase/baseline/2026-05-19_production_public_schema.reference.sql` once a
  fresh baseline is committed.
