# MSHA mine-map override operator runbook

## Scope

Use the External Data → MSHA review queue only after confirming a Justice-controller mine belongs to a configured subsidiary. The assignment writes an audited override and immediately materializes the mine in `msha_mine_org_map`; it does not guess ownership from the operator name.

Authorized roles: `admin`, `executive`, `environmental_manager`, `safety_manager`, and `coo`.

## Deploy

This branch is stacked on `codex/weekly-echo-sync-drain`. Merge and deploy that base first. Do not push migrations from this branch while the dry run still lists the QW4 or weekly ECHO migrations; that would mix deployments.

```bash
supabase migration list
supabase db push --dry-run
```

The dry run must list only the MSHA migration before continuing:

```text
20260731120000_msha_map_override_assignment.sql
```

Then apply and verify it:

```bash
supabase db push
supabase migration list
```

No Edge Function deployment or new secret is required for the inline override.

## Assign a reviewed mine

1. Open External Data → MSHA Sync & Abatement Clocks.
2. Confirm the status card reports mapped-mine counts rather than `Not configured`.
3. In Review queue, verify the mine ID, controller/operator evidence, state, and mine status.
4. Select the confirmed subsidiary, add a concise review note when useful, and choose **Assign**.
5. Confirm the mine leaves the review queue and the mapped-mine/review counts refresh.

## Verify

Replace the sample values before running the queries:

```sql
SELECT mine_id, organization_id, source, is_active, last_seen
FROM public.msha_mine_org_map
WHERE mine_id = '<mine-id>';

SELECT mine_id, organization_id, assigned_by, assigned_at, note
FROM public.msha_mine_org_override
WHERE mine_id = '<mine-id>';

SELECT action, user_id, organization_id, old_values, new_values, created_at
FROM public.audit_log
WHERE action = 'msha_map_override_assigned'
  AND new_values ->> 'mine_id' = '<mine-id>'
ORDER BY created_at DESC
LIMIT 1;

SELECT count(*) AS review_rows
FROM public.msha_mine_review
WHERE mine_id = '<mine-id>';
```

Expected results: one active `source = 'override'` map row, one override row, one audit row with actor/target details, and `review_rows = 0`.

## Failure handling

- `Insufficient permissions`: verify the operator has one authorized role; do not bypass the RPC with direct table writes.
- `Target organization is not configured`: add or correct `msha_subsidiary_org` through the governed configuration path before retrying.
- `Mine is not in the review queue`: refresh the page and re-check the current derived map; another operator or reconciliation may already have resolved it.
- Assignment failure: preserve the review evidence and retry only after the displayed database error is resolved. The database function is transactional, so a failed call does not leave a partial override/map/audit state.
