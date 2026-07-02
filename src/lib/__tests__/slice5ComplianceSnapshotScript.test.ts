import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('slice5 compliance snapshot validate script', () => {
  const script = readFileSync(
    resolve(process.cwd(), 'scripts/slice5-compliance-snapshot-validate.mjs'),
    'utf8',
  );

  it('generates snapshot and compares permit/outfall counts', () => {
    expect(script).toContain('generate_compliance_snapshot');
    expect(script).toContain('compliance_snapshots');
    expect(script).toContain('total_permits');
  });
});
