import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('parameter alias coverage migration', () => {
  const sql = readFileSync(
    resolve(import.meta.dirname, '../../../supabase/migrations/20260702190000_parameter_alias_coverage_rpc.sql'),
    'utf8',
  );

  it('defines get_parameter_alias_coverage RPC', () => {
    expect(sql).toContain('get_parameter_alias_coverage');
    expect(sql).toContain('missing_storet_code');
    expect(sql).toContain('parameters_without_aliases');
  });

  it('grants authenticated execute', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION get_parameter_alias_coverage');
  });
});
