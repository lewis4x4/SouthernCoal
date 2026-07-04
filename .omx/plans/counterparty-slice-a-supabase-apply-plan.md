# Counterparty Slice A Supabase Apply Plan

## Status Update - 2026-07-04

This plan is retained as deployment history. The Counterparty Slice A `2026070402*` migrations are present in the remote Supabase migration ledger, and the follow-on `20260704030000_status_mismatch_semantic_dismiss_rpc` migration was applied with `supabase db push` during dirty-branch closeout. Use `docs/GOLD_HANDOFF_ROADMAP_END_TO_END.md` for the current end-to-end roadmap handoff.

## Requirements Summary

Apply the six local-only Counterparty Graph Slice A migrations through the approved Supabase MCP/cloud path, not through an ad hoc local database mutation path. The handoff requires production apply via MCP plus committed migration files, and the slice verification command remains `npm run typecheck && npm run lint && npm test && npm run build` per `docs/HANDOFF_COUNTERPARTY_GRAPH.md:218`.

Current branch evidence:
- Branch: `cc/counterparty-graph-slice-a`
- Current pushed HEAD: `34b4547`
- Runtime proof command: `npm run test:migration:counterparty-slice-a` in `package.json:13`
- The migration proof script starts a disposable Postgres container and applies the Slice A migrations before assertions in `scripts/prove-counterparty-slice-a.sh:19`
- The org bridge migration asserts the MSHA-backed bridge count in `supabase/migrations/20260704024000_counterparty_org_party_bridge.sql:100`
- The merge migration blocks authenticated direct inserts into `party_merge_events` in `supabase/migrations/20260704023000_counterparty_party_merge_events.sql:270`

## Migrations To Apply

Apply these in dependency order:

1. `supabase/migrations/20260704020000_counterparty_party_taxonomy.sql`
2. `supabase/migrations/20260704021000_counterparty_parties.sql`
3. `supabase/migrations/20260704022000_counterparty_party_roles_relationships.sql`
4. `supabase/migrations/20260704023000_counterparty_party_merge_events.sql`
5. `supabase/migrations/20260704024000_counterparty_org_party_bridge.sql`
6. `supabase/migrations/20260704025000_counterparty_fold_in_seeds.sql`

## Acceptance Criteria

- Supabase cloud migration history shows all six `2026070402*` migrations applied remotely.
- `organizations.party_id` exists, is unique, references `parties(id)`, and bridges all 27 seeded MSHA organizations.
- `parties_tenancy_invariant` exists and rejects private parties with `organization_id IS NULL`.
- Tenant-authenticated writes cannot create or update shared-reference parties.
- Shared/private party merges are rejected.
- Tenant-authenticated users cannot directly insert `party_merge_events`; merges go through `apply_party_merge`.
- Same-tenant private merge records `party_merge_events.merged_by = auth.uid()` and sets `parties.superseded_by`.
- No Slice-B objects are created: `interactions`, `interaction_participants`, `interaction_media`, `capture_source`, `email_sync`, `portal_scrape`, `field_voice`.
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass after apply.

## Pre-Apply Steps

1. Confirm branch and commit:

```bash
git fetch origin
git checkout cc/counterparty-graph-slice-a
git pull --ff-only origin cc/counterparty-graph-slice-a
git rev-parse --short HEAD
```

Expected HEAD: `34b4547`.

2. Confirm migration status before apply:

```bash
supabase migration list
```

Expected: all existing migrations are matched local/remote through `20260704010000`; these six are local-only:

```text
20260704020000
20260704021000
20260704022000
20260704023000
20260704024000
20260704025000
```

3. Re-run local proof and app gates before cloud apply:

```bash
npm run test:migration:counterparty-slice-a
npm run typecheck
npm run lint
npm test
npm run build
```

4. Stop if any command fails. Do not partially apply migrations after a failed local proof.

## Approved MCP/Cloud Apply Steps

Use the approved Supabase MCP/cloud migration apply surface from an environment where that connector is available. This current Codex thread does not expose a Supabase MCP tool, and no installable Supabase connector was available in tool discovery, so this step must be executed from the approved cloud/MCP environment.

Apply the six files exactly as committed, in order:

```bash
supabase db push
```

If the approved cloud path exposes individual `apply_migration` calls instead of `db push`, use the exact file contents and migration names above, one call per migration, preserving order.

## Post-Apply Verification

1. Confirm remote migration ledger:

```bash
supabase migration list
```

2. Confirm the 27-org bridge:

```sql
WITH expected AS (
  SELECT COUNT(DISTINCT organization_id) AS expected_count
  FROM public.msha_subsidiary_org
),
actual AS (
  SELECT COUNT(*) AS actual_count
  FROM public.msha_subsidiary_org m
  JOIN public.organizations o ON o.id = m.organization_id
  JOIN public.parties p ON p.id = o.party_id
  WHERE p.party_kind = 'organization'
    AND p.organization_id = o.id
    AND p.is_shared_reference = false
)
SELECT expected.expected_count, actual.actual_count
FROM expected, actual;
```

Expected: `27 | 27`.

3. Confirm core constraints and policies:

```sql
SELECT conname
FROM pg_constraint
WHERE conname IN (
  'parties_tenancy_invariant',
  'organizations_party_id_key',
  'organizations_party_id_fkey'
)
ORDER BY conname;

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('parties', 'party_roles', 'party_relationships', 'party_merge_events')
ORDER BY tablename, policyname;
```

4. Confirm no Slice-B tables were introduced:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('interactions', 'interaction_participants', 'interaction_media')
ORDER BY table_name;
```

Expected: zero rows.

5. Re-run application gates after cloud apply:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Stop Conditions

- `supabase migration list` shows remote drift not explained by `supabase/BASELINE_ADOPTION.md`.
- Any migration fails.
- The org bridge query returns anything other than `27 | 27`.
- Any Slice-B object appears.
- Any post-apply app gate fails.

## Risks And Mitigations

- Risk: Supabase MCP/cloud tool is unavailable in the execution environment.
  Mitigation: Do not substitute a non-approved production mutation path; hand off this plan to an environment where the approved connector is present.
- Risk: remote data differs from the disposable proof baseline.
  Mitigation: rely on the migration's own bridge mismatch exception and the post-apply SQL checks.
- Risk: `service_role` bypass remains a broad authority.
  Mitigation: Slice A uses service role for migrations/admin only; do not cite user-facing immutability claims beyond the tenant-authenticated path until a broader service-role audit is complete.

## ADR

Decision: Apply the six Slice A migrations only through the approved Supabase MCP/cloud path.

Drivers:
- The handoff explicitly calls for prod apply via MCP plus committed migration files.
- Slice A touches production identity tenancy and merge boundaries.
- A cloud apply must leave a durable Supabase migration ledger.

Alternatives considered:
- Direct CLI apply from this local session: rejected because the requested path is MCP/cloud-approved apply.
- Manual SQL paste in dashboard: rejected because it is more error-prone and weaker as an audit trail.
- Delay all work until a full from-zero migration replay is possible: rejected because the repo already documents ledger drift and the Slice A proof uses a targeted disposable baseline.

Why chosen: MCP/cloud apply gives the approved production path while preserving migration ordering, auditability, and post-apply verification.

Consequences:
- This plan is ready, but execution requires the Supabase MCP/cloud connector.
- The branch remains safe to merge only after the remote ledger and post-apply checks pass.

Follow-ups:
- Run the cloud apply from an environment with Supabase MCP access.
- Attach the post-apply `supabase migration list` and 27/27 SQL output to the deployment record.
- Schedule a separate service-role policy audit before making broad immutability claims on any append-only table family.
