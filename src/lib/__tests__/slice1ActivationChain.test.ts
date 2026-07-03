import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('slice1 activation chain orchestrator', () => {
  const script = readFileSync(
    resolve(import.meta.dirname, '../../../scripts/slice1-activation-chain.mjs'),
    'utf8',
  );
  const pkg = readFileSync(resolve(import.meta.dirname, '../../../package.json'), 'utf8');

  it('ships qa:slice1-activation-chain npm script', () => {
    expect(pkg).toContain('"qa:slice1-activation-chain"');
    expect(pkg).toContain('scripts/slice1-activation-chain.mjs');
  });

  it('runs exceedance seed, repair, reconcile, gaps, and scoped detect', () => {
    expect(script).toContain('slice1-seed-exceedances.mjs');
    expect(script).toContain('slice1-repair-stuck-keys.mjs');
    expect(script).toContain('slice1-reconcile.mjs');
    expect(script).toContain('slice1-activation-gaps.mjs');
    expect(script).toContain('slice3-echo-batch-detect.mjs');
    expect(script).toContain('--suffix');
    expect(script).toContain('--skip-detect');
    expect(script).toContain("'--permit'");
  });

  it('calls report_slice1_activation_gaps for before/after acceptance', () => {
    expect(script).toContain('report_slice1_activation_gaps');
    expect(script).toContain('has_permit_limit');
    expect(script).toContain('missing_internal');
  });

  it('loads credentials from .env.local', () => {
    expect(script).toContain('loadEnvLocal');
    expect(script).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
