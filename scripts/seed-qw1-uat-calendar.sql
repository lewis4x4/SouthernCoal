-- =============================================================================
-- Lane C QW1 — synthetic sampling calendar for UAT gap-detection demo
-- =============================================================================
-- Prerequisites: scripts/seed-lane-a-wv-uat.sql applied (org, permit, outfalls).
--
-- Creates 2 schedules + 4 calendar rows:
--   • missed pH (21 days late, no lab)
--   • at-risk TSS (due within 2-day horizon)
--   • documented skip (excused — should NOT open a gap)
--   • future event (outside horizon — should NOT open a gap)
--
-- After seeding, run gap detection:
--   SELECT detect_sampling_calendar_gaps('f0000001-0001-4001-8001-000000000001'::uuid, CURRENT_DATE, 2, 'manual');
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_org constant uuid := 'f0000001-0001-4001-8001-000000000001'::uuid;
  v_permit constant uuid := 'f0000003-0003-4003-8003-000000000003'::uuid;
  v_of1 constant uuid := 'f0000004-0004-4004-8004-000000000001'::uuid;
  v_param_ph constant uuid := 'ece2b187-d9ea-43ec-b786-e3525bea08ea'::uuid;
  v_param_tss constant uuid := 'd1ee9a87-5fcc-4c5a-95a0-b26b3ba228cb'::uuid;

  v_sched_ph constant uuid := 'f0000101-0001-4001-8001-000000000001'::uuid;
  v_sched_tss constant uuid := 'f0000101-0001-4001-8001-000000000002'::uuid;

  v_cal_missed constant uuid := 'f0000201-0001-4001-8001-000000000001'::uuid;
  v_cal_at_risk constant uuid := 'f0000202-0002-4002-8002-000000000002'::uuid;
  v_cal_excused constant uuid := 'f0000203-0003-4003-8003-000000000003'::uuid;
  v_cal_future constant uuid := 'f0000204-0004-4004-8004-000000000004'::uuid;

  v_today date := CURRENT_DATE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org) THEN
    RAISE EXCEPTION 'UAT org missing — run scripts/seed-lane-a-wv-uat.sql first';
  END IF;

  INSERT INTO sampling_schedules (
    id, organization_id, permit_id, outfall_id, parameter_id,
    frequency_code, frequency_description, sample_type, period_type,
    is_active, source, schedule_anchor_date
  ) VALUES
    (v_sched_ph, v_org, v_permit, v_of1, v_param_ph,
     '1/month', 'Monthly pH — QW1 UAT', 'grab', 'month', true, 'manual', v_today - 60),
    (v_sched_tss, v_org, v_permit, v_of1, v_param_tss,
     '1/month', 'Monthly TSS — QW1 UAT', 'grab', 'month', true, 'manual', v_today - 60)
  ON CONFLICT (id) DO UPDATE SET
    is_active = EXCLUDED.is_active,
    updated_at = now();

  INSERT INTO sampling_calendar (
    id, organization_id, schedule_id, outfall_id, parameter_id,
    scheduled_date, window_start, window_end, status, dispatch_status,
    skip_reason
  ) VALUES
    (v_cal_missed, v_org, v_sched_ph, v_of1, v_param_ph,
     v_today - 21, v_today - 21, v_today - 21, 'overdue', 'ready', NULL),
    (v_cal_at_risk, v_org, v_sched_tss, v_of1, v_param_tss,
     v_today + 1, v_today, v_today + 1, 'scheduled', 'ready', NULL),
    (v_cal_excused, v_org, v_sched_ph, v_of1, v_param_ph,
     v_today - 10, v_today - 10, v_today - 10, 'skipped', 'skipped', 'Road closed — UAT QW1 excuse demo'),
    (v_cal_future, v_org, v_sched_tss, v_of1, v_param_tss,
     v_today + 30, v_today + 30, v_today + 30, 'scheduled', 'ready', NULL)
  ON CONFLICT (id) DO UPDATE SET
    scheduled_date = EXCLUDED.scheduled_date,
    window_start = EXCLUDED.window_start,
    window_end = EXCLUDED.window_end,
    status = EXCLUDED.status,
    dispatch_status = EXCLUDED.dispatch_status,
    skip_reason = EXCLUDED.skip_reason,
    updated_at = now();
END $$;

COMMIT;
