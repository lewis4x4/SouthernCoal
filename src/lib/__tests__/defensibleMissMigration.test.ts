import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('defensible miss migration', () => {
  it('defines flanking packet and collector anomaly RPCs', () => {
    const sql = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../supabase/migrations/20260701150000_defensible_miss_packet.sql',
      ),
      'utf8',
    );

    expect(sql).toContain('get_flanking_samples_for_gap');
    expect(sql).toContain('get_collector_access_anomalies');
    expect(sql).toContain('defensible_miss_packet_generated');
  });
});
