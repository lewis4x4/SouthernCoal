import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('slice1 echo permit join helper migration', () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703270000_slice1_echo_permit_join_helper.sql',
    ),
    'utf8',
  );

  it('defines resolve_npdes_permit_id_for_echo with federal override', () => {
    expect(sql).toContain('resolve_npdes_permit_id_for_echo');
    expect(sql).toContain("metadata->>'federal_npdes_id_override'");
  });
});
