import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('slice6 VA NPDES confirmation basis migration', () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703060000_slice6_va_npdes_confirmation_basis.sql',
    ),
    'utf8',
  );

  it('adds confirmation_basis columns to npdes_id_overrides', () => {
    expect(sql).toContain('confirmation_basis');
    expect(sql).toContain('confirmation_reference');
    expect(sql).toContain('confirmed_at');
  });

  it('constrains allowed basis values', () => {
    expect(sql).toContain('va_deq_ceds');
    expect(sql).toContain('cd_attachment_f');
  });
});
