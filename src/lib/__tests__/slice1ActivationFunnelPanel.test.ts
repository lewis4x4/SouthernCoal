import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Slice1ActivationFunnelPanel', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/external-data/Slice1ActivationFunnelPanel.tsx'),
    'utf8',
  );

  it('links to Upload Dashboard and Review Queue', () => {
    expect(source).toContain('to="/compliance"');
    expect(source).toContain('to="/review-queue"');
    expect(source).toContain('qa:slice1-activate');
  });

  it('shows funnel stages and top permit limit gaps', () => {
    expect(source).toContain('Has permit limit');
    expect(source).toContain('top_permits_missing_limits');
  });
});

describe('useSlice1ActivationGaps', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/hooks/useSlice1ActivationGaps.ts'), 'utf8');

  it('calls report_slice1_activation_gaps RPC', () => {
    expect(source).toContain('report_slice1_activation_gaps');
  });
});
