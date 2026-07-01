-- =============================================================================
-- Lane C MSHA — synthetic abatement-at-risk rows for UAT demo
-- =============================================================================
-- Prerequisites: seed-lane-a-wv-uat.sql (org exists)
-- Global mine map already has 106 active mines (migration 20260701180000).
--
-- Inserts 2 open MSHA citations on the UAT org for abatement panel smoke:
--   1. Overdue abatement (10 days past due)
--   2. Due within 14-day window (5 days out)
--
-- After seeding:
--   SELECT * FROM get_msha_abatement_at_risk('f0000001-0001-4001-8001-000000000001'::uuid, 14);
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_org constant uuid := 'f0000001-0001-4001-8001-000000000001'::uuid;
  v_mine constant text := '4602380';
  v_today date := CURRENT_DATE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org) THEN
    RAISE EXCEPTION 'UAT org missing — run scripts/seed-lane-a-wv-uat.sql first';
  END IF;

  INSERT INTO external_msha_inspections (
    id,
    organization_id,
    mine_id,
    event_number,
    inspection_date,
    inspection_type,
    violation_number,
    violation_type,
    section_of_act,
    significant_substantial,
    proposed_penalty,
    current_status,
    violation_issue_date,
    abatement_due_date,
    termination_date,
    contested,
    raw_data
  ) VALUES
    (
      'f0000601-0001-4001-8001-000000000001'::uuid,
      v_org,
      v_mine,
      'UAT-EVT-001',
      v_today - 30,
      'Regular',
      'UAT-VIO-001',
      'Citation',
      '104(a)',
      true,
      500.00,
      'Open',
      v_today - 25,
      v_today - 10,
      NULL,
      false,
      '{"source":"qw-msha-uat-seed","note":"overdue abatement demo"}'::jsonb
    ),
    (
      'f0000602-0002-4002-8002-000000000002'::uuid,
      v_org,
      v_mine,
      'UAT-EVT-002',
      v_today - 14,
      'Regular',
      'UAT-VIO-002',
      'Citation',
      '75.370',
      false,
      250.00,
      'Open',
      v_today - 10,
      v_today + 5,
      NULL,
      false,
      '{"source":"qw-msha-uat-seed","note":"due soon abatement demo"}'::jsonb
    )
  ON CONFLICT (organization_id, mine_id, violation_number) DO UPDATE SET
    abatement_due_date = EXCLUDED.abatement_due_date,
    termination_date = EXCLUDED.termination_date,
    current_status = EXCLUDED.current_status,
    synced_at = now();
END $$;

COMMIT;
