import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildEchoBatchPlan,
  buildEchoCoverageResult,
} from '../../../supabase/functions/_shared/echo-sync-batching';

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../supabase/migrations/20260727120000_weekly_echo_sync_continuation.sql',
  ),
  'utf8',
);

const syncSource = readFileSync(
  resolve(import.meta.dirname, '../../../supabase/functions/sync-echo-data/index.ts'),
  'utf8',
);

describe('weekly ECHO stale-permit drain', () => {
  it('selects five permits and carries every other eligible permit into the continuation', () => {
    const eligibleNpdesIds = Array.from({ length: 12 }, (_, index) =>
      `WV${String(index + 1).padStart(7, '0')}`,
    );

    const plan = buildEchoBatchPlan({
      eligibleNpdesIds,
      limit: 5,
    });

    expect(plan.selectedNpdesIds).toEqual(eligibleNpdesIds.slice(0, 5));
    expect(plan.remainingUnprocessedNpdesIds).toEqual(eligibleNpdesIds.slice(5));
    expect(plan.coverageNpdesIds).toEqual(eligibleNpdesIds);
    expect(plan.hasMore).toBe(true);
  });

  it('resumes from explicit permit ids without offset-skipping a changing stale set', () => {
    const plan = buildEchoBatchPlan({
      eligibleNpdesIds: ['WV0000006', 'WV0000007', 'WV0000008'],
      continuationNpdesIds: ['WV0000006', 'WV0000007', 'WV0000008', 'WVREMOVED'],
      priorCoverageNpdesIds: [
        'WV0000001',
        'WV0000002',
        'WV0000003',
        'WV0000004',
        'WV0000005',
        'WV0000006',
        'WV0000007',
        'WV0000008',
        'WVREMOVED',
      ],
      limit: 2,
    });

    expect(plan.selectedNpdesIds).toEqual(['WV0000006', 'WV0000007']);
    expect(plan.remainingUnprocessedNpdesIds).toEqual(['WV0000008']);
    expect(plan.unresolvedNpdesIds).toEqual(['WVREMOVED']);
    expect(plan.coverageNpdesIds).toHaveLength(9);
  });

  it('preserves unlimited explicit targets for existing manual and repair runs', () => {
    const eligibleNpdesIds = Array.from({ length: 7 }, (_, index) =>
      `WV${String(index + 1).padStart(7, '0')}`,
    );

    const plan = buildEchoBatchPlan({
      eligibleNpdesIds,
      targetNpdesIds: eligibleNpdesIds,
      limit: 5,
    });

    expect(plan.selectedNpdesIds).toEqual(eligibleNpdesIds);
    expect(plan.hasMore).toBe(false);
  });

  it('identifies all unprocessed, failed, and unresolved permits as remaining coverage', () => {
    const result = buildEchoCoverageResult({
      coverageNpdesIds: ['WV0000001', 'WV0000002', 'WV0000003', 'WV0000004'],
      processedNpdesIds: ['WV0000001', 'WV0000002'],
      remainingUnprocessedNpdesIds: ['WV0000003'],
      failedNpdesIds: ['WV0000002'],
      unresolvedNpdesIds: ['WV0000004'],
      continuationDispatched: true,
      batchNumber: 1,
    });

    expect(result.coverage_complete).toBe(false);
    expect(result.remaining_count).toBe(3);
    expect(result.remaining_npdes_ids).toEqual([
      'WV0000003',
      'WV0000002',
      'WV0000004',
    ]);
    expect(result.continuation_dispatched).toBe(true);
  });

  it('reports complete coverage only when the final batch leaves no permit behind', () => {
    const result = buildEchoCoverageResult({
      coverageNpdesIds: ['WV0000001', 'WV0000002'],
      processedNpdesIds: ['WV0000001', 'WV0000002'],
      remainingUnprocessedNpdesIds: [],
      failedNpdesIds: [],
      unresolvedNpdesIds: [],
      continuationDispatched: false,
      batchNumber: 2,
    });

    expect(result.coverage_complete).toBe(true);
    expect(result.remaining_count).toBe(0);
    expect(result.remaining_npdes_ids).toEqual([]);
  });

  it('dispatches continuations through the existing audited edge-job ledger', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.echo_sync_continuations');
    expect(migration).toContain('PRIMARY KEY (root_job_run_id, batch_number)');
    expect(migration).toContain(
      'ON CONFLICT (root_job_run_id, batch_number) DO NOTHING',
    );
    expect(migration).toContain('RETURN v_existing.net_request_id');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.dispatch_echo_weekly_sync_continuation');
    expect(migration).toMatch(/dispatch_edge_job\(\s*'sync-echo-weekly'/);
    expect(migration).toContain("'auto_continue', true");
    expect(migration).toContain("'limit', 5");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.dispatch_echo_weekly_sync_continuation');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.dispatch_echo_weekly_sync_continuation');
    expect(migration).toContain('TO service_role');
  });

  it('preserves auth, per-permit isolation, retries, auditing, and job closeout', () => {
    expect(syncSource).toContain('const auth = await validateAuth(req, supabase)');
    expect(syncSource).toMatch(
      /if \(!isPrivileged\)[\s\S]*?autoContinue = false;[\s\S]*?continuationNpdesIds = \[\];/,
    );
    expect(syncSource).toContain('for (const permit of permits)');
    expect(syncSource).toContain('for (let attempt = 0; attempt < retries; attempt++)');
    expect(syncSource).toContain('.from("audit_log").insert');
    expect(syncSource).toContain('await completeJobRun(supabase, jobRunId');
    expect(syncSource).toMatch(/\.rpc\(\s*"dispatch_echo_weekly_sync_continuation"/);
    expect(syncSource).toContain('coverage: coverageResult');
  });

  it('fails the HTTP result when terminal job coverage is incomplete', () => {
    expect(syncSource).toContain('success: jobStatus === "succeeded"');
    expect(syncSource).toContain('status: jobStatus === "succeeded" ? 200 : 500');
  });

  it('persists no-permit terminal coverage to sync and audit logs', () => {
    expect(syncSource).toContain('const { data: noPermitSyncLog');
    expect(syncSource).toContain('.from("external_sync_log")');
    expect(syncSource).toContain('const { error: noPermitAuditError }');
    expect(syncSource).toContain('record_id: noPermitSyncLog.id');
    expect(syncSource).toContain('status: coverageResult.coverage_complete ? 200 : 500');
  });
});
