import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('get_equipment_due_maintenance migration', () => {
  it('defines RPC cloned from calibration due pattern', () => {
    const sql = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../supabase/migrations/20260701140000_get_equipment_due_maintenance.sql',
      ),
      'utf8',
    );

    expect(sql).toContain('get_equipment_due_maintenance');
    expect(sql).toContain('maintenance_logs');
    expect(sql).toContain('next_maintenance_due');
    expect(sql).toContain('get_user_org_id()');
  });
});
