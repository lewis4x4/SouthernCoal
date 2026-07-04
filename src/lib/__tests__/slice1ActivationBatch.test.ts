import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('slice1 activation batch runner', () => {
  const script = readFileSync(
    resolve(import.meta.dirname, '../../../scripts/slice1-activation-batch.mjs'),
    'utf8',
  );
  const pkg = readFileSync(resolve(import.meta.dirname, '../../../package.json'), 'utf8');

  it('ships qa:slice1-activation-batch npm script', () => {
    expect(pkg).toContain('"qa:slice1-activation-batch"');
    expect(pkg).toContain('scripts/slice1-activation-batch.mjs');
  });

  it('pulls current top missing-limit permits from the activation gap RPC', () => {
    expect(script).toContain('report_slice1_activation_gaps');
    expect(script).toContain('top_permits_missing_limits');
    expect(script).toContain("statePrefix: 'WV'");
    expect(script).toContain('selectNextPermit');
  });

  it('runs the single-permit activation chain permit-by-permit', () => {
    expect(script).toContain('qa:slice1-activation-chain');
    expect(script).toContain("'--permit'");
    expect(script).toContain('spawnSync');
    expect(script).toContain('continueOnError');
  });

  it('writes one ranked summary artifact with deltas and commands', () => {
    expect(script).toContain('Ranked summary');
    expect(script).toContain('Overall deltas');
    expect(script).toContain('Commands run');
    expect(script).toContain('slice1-${opts.statePrefix ||');
    expect(script).toContain('batch-activation');
  });
});
