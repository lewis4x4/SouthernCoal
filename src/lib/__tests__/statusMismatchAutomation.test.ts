import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('status mismatch semantic dismiss RPC', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260704030000_status_mismatch_semantic_dismiss_rpc.sql'),
    'utf8',
  );

  it('dismisses only semantic ECHO permit-status matches', () => {
    expect(sql).toContain('bulk_dismiss_semantic_status_mismatches');
    expect(sql).toContain('Authentication required');
    expect(sql).toContain('can_manage_sampling_records()');
    expect(sql).toContain("dr.source = 'echo'");
    expect(sql).toContain("dr.discrepancy_type = 'status_mismatch'");
    expect(sql).toContain("dr.internal_source_table = 'npdes_permits'");
    expect(sql).toContain('map_echo_permit_status_to_internal(dr.external_value) = lower(trim(coalesce(dr.internal_value');
    expect(sql).toContain("status = 'dismissed'");
    expect(sql).toContain('Internal status already matches ECHO semantic status');
  });
});

describe('Review Queue semantic status mismatch dismissal', () => {
  const hook = readFileSync(resolve(process.cwd(), 'src/hooks/useDiscrepancies.ts'), 'utf8');
  const page = readFileSync(resolve(process.cwd(), 'src/pages/ReviewQueuePage.tsx'), 'utf8');
  const banner = readFileSync(
    resolve(process.cwd(), 'src/components/review-queue/StatusMismatchTriageBanner.tsx'),
    'utf8',
  );

  it('wires a guarded semantic dismiss action instead of generic bulk review', () => {
    expect(hook).toContain('bulk_dismiss_semantic_status_mismatches');
    expect(hook).toContain('semantic_status_mismatch');
    expect(page).toContain('handleDismissSemanticStatusMismatches');
    expect(page).toContain('Rows that imply a permit lifecycle change will remain pending');
    expect(banner).toContain('Dismiss semantic');
    expect(banner).toContain('Do not bulk-mark reviewed');
  });
});

describe('slice4 status mismatch export automation split', () => {
  const script = readFileSync(resolve(process.cwd(), 'scripts/slice4-status-mismatch-export.mjs'), 'utf8');
  const pkg = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');

  it('separates dismiss, one-click align, and human-judgment artifacts', () => {
    expect(script).toContain('--apply-safe-dismisses');
    expect(script).toContain('dismiss_with_note');
    expect(script).toContain('one_click_align_candidate');
    expect(script).toContain('human_judgment');
    expect(script).toContain('slice4-status-mismatch-dismiss-with-note-${dateStamp}.csv');
    expect(script).toContain('slice4-status-mismatch-safe-dismissed-${dateStamp}.csv');
    expect(script).toContain('slice4-status-mismatch-one-click-align-${dateStamp}.csv');
    expect(script).toContain('slice4-status-mismatch-human-judgment-${dateStamp}.csv');
    expect(script).toContain('slice4-status-mismatch-operator-final-${dateStamp}.md');
    expect(script).toContain('audit_log');
    expect(pkg).toContain('qa:slice4-status-mismatch:apply-safe-dismisses');
  });
});
