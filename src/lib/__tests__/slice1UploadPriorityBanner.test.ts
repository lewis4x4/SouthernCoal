import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Slice1UploadPriorityBanner', () => {
  it('is mounted on Upload Dashboard', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/pages/UploadDashboard.tsx'), 'utf8');
    expect(page).toContain('Slice1UploadPriorityBanner');
  });

  it('links to external data activation funnel', () => {
    const banner = readFileSync(
      resolve(process.cwd(), 'src/components/dashboard/Slice1UploadPriorityBanner.tsx'),
      'utf8',
    );
    expect(banner).toContain('/compliance/external-data');
    expect(banner).toContain('useSlice1ActivationGaps');
    expect(banner).toContain('synthetic_echo_limits');
  });
});

describe('slice1 activation gap metrics migration', () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703280000_slice1_activation_gap_metrics.sql',
    ),
    'utf8',
  );

  it('adds no_permit and synthetic_echo_limits to gap report', () => {
    expect(sql).toContain('no_permit');
    expect(sql).toContain('synthetic_echo_limits');
    expect(sql).toContain('SYNTHETIC_UAT_SLICE1');
  });
});
