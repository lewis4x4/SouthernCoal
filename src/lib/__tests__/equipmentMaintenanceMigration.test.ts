import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rpcMigrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260701140000_get_equipment_due_maintenance.sql',
);
const keystoneMigrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260703120000_keystone_k1_coupled_work_orders.sql',
);
const hardeningMigrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260705160000_qw4_equipment_maintenance_rpc_hardening.sql',
);

function extractFunctionBody(sql: string, functionName: string): string | undefined {
  return sql.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION (?:public\\.)?${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
    ),
  )?.[0];
}

describe('get_equipment_due_maintenance migration', () => {
  it('defines RPC cloned from calibration due pattern', () => {
    const sql = readFileSync(rpcMigrationPath, 'utf8');

    expect(sql).toContain('get_equipment_due_maintenance');
    expect(sql).toContain('maintenance_logs');
    expect(sql).toContain('next_maintenance_due');
    expect(sql).toContain('get_user_org_id()');
  });

  it('couples QW4 maintenance alerts to work orders in the Keystone detector', () => {
    const sql = readFileSync(keystoneMigrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS equipment_maintenance_alerts');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION open_equipment_maintenance_with_work_order');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION detect_equipment_maintenance_gaps');
    expect(sql).toContain("'equipment_maintenance'");
    expect(sql).toContain('INSERT INTO work_orders');
    expect(sql).toContain('INSERT INTO work_order_events');
    expect(sql).toContain('run_equipment_maintenance_detection_nightly');
    expect(sql).toContain("'detect-equipment-maintenance-nightly'");
  });

  it('hardens QW4 SECURITY DEFINER helper access and org scoping', () => {
    const sql = readFileSync(hardeningMigrationPath, 'utf8');
    const openBody = extractFunctionBody(sql, 'open_equipment_maintenance_with_work_order');
    const detectBody = extractFunctionBody(sql, 'detect_equipment_maintenance_gaps');

    expect(openBody).toBeTruthy();
    expect(openBody).toContain('PERFORM resolve_scoped_org_id(p_organization_id)');
    expect(openBody).toContain('Equipment not found or not accessible');
    expect(openBody).toContain('ec.organization_id = p_organization_id');

    expect(sql).toContain('REVOKE ALL ON FUNCTION public.open_equipment_maintenance_with_work_order');
    expect(sql).toContain(') FROM authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.open_equipment_maintenance_with_work_order');
    expect(sql).toContain('TO service_role');

    expect(detectBody).toBeTruthy();
    expect(detectBody).toContain('v_org_id uuid := resolve_scoped_org_id(p_organization_id)');
    expect(detectBody).toContain('v_existing_alert_id uuid');
    expect(detectBody).toContain('IF v_existing_alert_id IS NULL THEN');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.detect_equipment_maintenance_gaps');
    expect(sql).toContain('TO authenticated, service_role');
  });
});
