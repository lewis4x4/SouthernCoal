-- =============================================================================
-- Lane C QW4 — synthetic overdue / due-soon field gear for UAT demo
-- =============================================================================
-- Prerequisites: scripts/seed-lane-a-wv-uat.sql applied (org + auth users).
--
-- Creates three sampling-gear assets + maintenance_logs:
--   1. pH meter — PM overdue (10 days past due)
--   2. GPS unit — PM due within 14-day window (5 days out)
--   3. Sample cooler — PM current (60 days out; excluded from default RPC window)
--
-- After seeding:
--   SELECT * FROM get_equipment_due_maintenance(
--     'f0000001-0001-4001-8001-000000000001'::uuid, 14
--   );
--   Expect 2 rows (overdue + due soon).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_org constant uuid := 'f0000001-0001-4001-8001-000000000001'::uuid;
  v_sampler constant uuid := 'fe7979b3-3abd-4a00-8f4a-6d20757e4af4'::uuid;
  v_admin constant uuid := '67551f36-e0a3-4ff9-83ac-42a9f48faac0'::uuid;

  v_eq_overdue constant uuid := 'f0000401-0001-4001-8001-000000000001'::uuid;
  v_eq_due_soon constant uuid := 'f0000402-0002-4002-8002-000000000002'::uuid;
  v_eq_current constant uuid := 'f0000403-0003-4003-8003-000000000003'::uuid;

  v_ml_overdue constant uuid := 'f0000404-0004-4004-8004-000000000004'::uuid;
  v_ml_due_soon constant uuid := 'f0000405-0005-4005-8005-000000000005'::uuid;
  v_ml_current constant uuid := 'f0000406-0006-4006-8006-000000000006'::uuid;

  v_assign constant uuid := 'f0000407-0007-4007-8007-000000000007'::uuid;

  v_today date := CURRENT_DATE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org) THEN
    RAISE EXCEPTION 'UAT org missing — run scripts/seed-lane-a-wv-uat.sql first';
  END IF;

  INSERT INTO equipment_catalog (
    id, organization_id, name, equipment_type, serial_number, model, manufacturer,
    requires_calibration, calibration_interval_days, status, is_active
  ) VALUES
    (
      v_eq_overdue, v_org, 'UAT pH Meter (QW4 overdue)', 'meter', 'QW4-PH-001',
      'HQ440d', 'Hach', true, 90, 'assigned', true
    ),
    (
      v_eq_due_soon, v_org, 'UAT GPS Handheld (QW4 due soon)', 'gps', 'QW4-GPS-002',
      'GPSMAP 66i', 'Garmin', false, NULL, 'available', true
    ),
    (
      v_eq_current, v_org, 'UAT Sample Cooler (QW4 current)', 'cooler', 'QW4-CLR-003',
      'Igloo 48qt', 'Igloo', false, NULL, 'available', true
    )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    serial_number = EXCLUDED.serial_number,
    status = EXCLUDED.status,
    is_active = EXCLUDED.is_active,
    updated_at = now();

  INSERT INTO equipment_assignments (
    id, equipment_id, assigned_to, assigned_by, condition_on_assign
  ) VALUES (
    v_assign, v_eq_overdue, v_sampler, v_admin, 'good'
  )
  ON CONFLICT (id) DO UPDATE SET
    assigned_to = EXCLUDED.assigned_to,
    returned_at = NULL;

  INSERT INTO maintenance_logs (
    id, equipment_id, performed_by, maintenance_type, description,
    performed_at, next_maintenance_due
  ) VALUES
    (
      v_ml_overdue, v_eq_overdue, v_admin, 'preventive',
      'QW4 UAT — quarterly probe service',
      (v_today - 100)::timestamptz,
      v_today - 10
    ),
    (
      v_ml_due_soon, v_eq_due_soon, v_admin, 'preventive',
      'QW4 UAT — battery + firmware check',
      (v_today - 85)::timestamptz,
      v_today + 5
    ),
    (
      v_ml_current, v_eq_current, v_admin, 'preventive',
      'QW4 UAT — cooler seal inspection',
      (v_today - 30)::timestamptz,
      v_today + 60
    )
  ON CONFLICT (id) DO UPDATE SET
    performed_at = EXCLUDED.performed_at,
    next_maintenance_due = EXCLUDED.next_maintenance_due,
    description = EXCLUDED.description;
END $$;

COMMIT;
