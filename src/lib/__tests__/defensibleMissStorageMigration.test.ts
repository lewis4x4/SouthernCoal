import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('defensible miss storage migration', () => {
  it('defines packet table, bucket, and org-scoped storage policies', () => {
    const sql = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../supabase/migrations/20260701160000_defensible_miss_packet_storage.sql',
      ),
      'utf8',
    );

    expect(sql).toContain('defensible_miss_packets');
    expect(sql).toContain('defensible-miss-packets');
    expect(sql).toContain('chief_counsel');
    expect(sql).toContain('sha256_hash');
  });
});
