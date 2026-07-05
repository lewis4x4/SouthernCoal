import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationNames = [
  '20260704020000_counterparty_party_taxonomy.sql',
  '20260704021000_counterparty_parties.sql',
  '20260704022000_counterparty_party_roles_relationships.sql',
  '20260704023000_counterparty_party_merge_events.sql',
  '20260704024000_counterparty_org_party_bridge.sql',
  '20260704025000_counterparty_fold_in_seeds.sql',
] as const;

function readMigration(name: (typeof migrationNames)[number]) {
  return readFileSync(
    resolve(import.meta.dirname, '../../../supabase/migrations', name),
    'utf8',
  );
}

describe('Counterparty Graph Slice A migrations', () => {
  const migrations = Object.fromEntries(
    migrationNames.map((name) => [name, readMigration(name)]),
  ) as Record<(typeof migrationNames)[number], string>;

  const combinedSql = migrationNames.map((name) => migrations[name]).join('\n');

  it('enforces the parties tenancy invariant and tenant shared-write denial', () => {
    const partiesSql = migrations['20260704021000_counterparty_parties.sql'];

    expect(partiesSql).toContain('CONSTRAINT parties_tenancy_invariant CHECK');
    expect(partiesSql).toContain('(is_shared_reference AND organization_id IS NULL)');
    expect(partiesSql).toContain('(NOT is_shared_reference AND organization_id IS NOT NULL)');
    expect(partiesSql).toContain('organization_id = get_user_org_id()');
    expect(partiesSql).toContain('AND NOT is_shared_reference');
    expect(partiesSql).toContain('CREATE POLICY "parties_insert"');
    expect(partiesSql).toContain('CREATE POLICY "parties_service"');
  });

  it('rejects shared/private merges through the merge-boundary trigger', () => {
    const mergeSql = migrations['20260704023000_counterparty_party_merge_events.sql'];

    expect(mergeSql).toContain('CREATE TABLE IF NOT EXISTS public.party_merge_events');
    expect(mergeSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_party_merge_events_active_superseded');
    expect(mergeSql).toContain('CREATE TRIGGER enforce_party_merge_boundary');
    expect(mergeSql).toContain('BEFORE UPDATE OF superseded_by ON public.parties');
    expect(mergeSql).toContain(
      'Shared/private party merges are prohibited; use a same_as relationship instead',
    );
    expect(mergeSql).toContain('current_setting(\'app.party_merge_authorized\', true)');
    expect(mergeSql).toContain('CREATE OR REPLACE VIEW public.parties_resolved');
  });

  it('forces merge audit integrity through the RPC-only append path', () => {
    const mergeSql = migrations['20260704023000_counterparty_party_merge_events.sql'];

    expect(mergeSql).toContain('REVOKE INSERT, UPDATE, DELETE ON public.party_merge_events FROM authenticated');
    expect(mergeSql).not.toMatch(/CREATE POLICY "party_merge_events_insert"[\s\S]*FOR INSERT TO authenticated/);
    expect(mergeSql).toContain('NEW.merged_by := auth.uid();');
    expect(mergeSql).not.toContain('NEW.merged_by := COALESCE(NEW.merged_by, auth.uid())');
    expect(mergeSql).toMatch(/WHERE id IN \(NEW\.surviving_party_id, NEW\.superseded_party_id\)[\s\S]*ORDER BY id[\s\S]*FOR UPDATE/);
    expect(mergeSql).toContain('GET DIAGNOSTICS v_updated_count = ROW_COUNT');
    expect(mergeSql).toContain('IF v_updated_count <> 1 THEN');
  });

  it('keeps role and relationship assertions tenant-private with bitemporal no-overlap', () => {
    const assertionSql = migrations['20260704022000_counterparty_party_roles_relationships.sql'];

    expect(assertionSql).toContain('CREATE EXTENSION IF NOT EXISTS btree_gist');
    expect(assertionSql).toContain('CREATE TABLE IF NOT EXISTS public.party_roles');
    expect(assertionSql).toContain('CREATE TABLE IF NOT EXISTS public.party_relationships');
    expect(assertionSql).toContain('CONSTRAINT party_roles_no_overlap');
    expect(assertionSql).toContain('CONSTRAINT party_relationships_no_overlap');
    expect(assertionSql).toContain('USING (organization_id = get_user_org_id())');
    expect(assertionSql).toContain("RAISE EXCEPTION 'owns_or_controls relationships derive from msha_mine_org_map'");
  });

  it('keeps the Slice A identity spine ungated from Slice B auto-capture policy', () => {
    const spineSql = [
      migrations['20260704021000_counterparty_parties.sql'],
      migrations['20260704022000_counterparty_party_roles_relationships.sql'],
      migrations['20260704023000_counterparty_party_merge_events.sql'],
    ].join('\n');

    expect(spineSql).toContain('CREATE POLICY "parties_insert"');
    expect(spineSql).toContain('CREATE POLICY "party_roles_insert"');
    expect(spineSql).toContain('CREATE POLICY "party_relationships_insert"');
    expect(spineSql).toContain('CREATE OR REPLACE FUNCTION public.apply_party_merge');

    expect(spineSql).not.toMatch(/\bprivilege\b/i);
    expect(spineSql).not.toMatch(/\bretention\b/i);
    expect(spineSql).not.toMatch(/\bfoia\b/i);
    expect(spineSql).not.toContain('pending_review');
    expect(spineSql).not.toContain('interaction_privilege_reviews');
    expect(spineSql).not.toContain('capture_source');
  });

  it('bridges the 27 seeded organizations to private org-kind parties', () => {
    const bridgeSql = migrations['20260704024000_counterparty_org_party_bridge.sql'];

    expect(bridgeSql).toContain('ADD COLUMN IF NOT EXISTS party_id uuid');
    expect(bridgeSql).toContain('organizations_party_id_key');
    expect(bridgeSql).toContain('organizations_party_id_fkey');
    expect(bridgeSql).toContain('FROM public.msha_subsidiary_org');
    expect(bridgeSql).toContain('organizations.party_id bridge mismatch');
    expect(bridgeSql).toContain('Expected on the SCC seed set: 27 / 27');
  });

  it('folds in existing identity sources without creating Slice-B objects', () => {
    const seedSql = migrations['20260704025000_counterparty_fold_in_seeds.sql'];

    expect(seedSql).toContain('FROM public.user_profiles up');
    expect(seedSql).toContain('FROM public.emergency_contacts ec');
    expect(seedSql).toContain("'state_agency:' || state_code || ':' || agency_code");
    expect(seedSql).toContain('HANDOFF_COUNTERPARTY_GRAPH.md section 6 labs');
    expect(seedSql).toContain('Tom Lusk');
    expect(seedSql).toContain('Jay Justice');
    expect(seedSql).toContain('Carey Douglas Kessler & Ruby');

    expect(combinedSql).not.toMatch(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?interactions\b/i);
    expect(combinedSql).not.toMatch(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?interaction_participants\b/i);
    expect(combinedSql).not.toMatch(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?interaction_media\b/i);
    expect(combinedSql).not.toContain('capture_source');
    expect(combinedSql).not.toContain('email_sync');
    expect(combinedSql).not.toContain('portal_scrape');
    expect(combinedSql).not.toContain('field_voice');
  });
});
