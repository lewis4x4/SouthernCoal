-- =============================================================================
-- Lane C QW3 — flanking clean samples + collector access fingerprint (UAT demo)
-- =============================================================================
-- Prerequisites:
--   scripts/seed-lane-a-wv-uat.sql
--   scripts/seed-qw1-uat-calendar.sql (+ gap detection run)
--
-- Seeds:
--   • Clean pH lab results 7 days before and after the QW1 missed date
--   • Completed field visits with access_issue outcomes for collector fingerprint
--
-- After seeding, open:
--   /compliance/defensible-miss?gapId=<missed-gap-uuid>
-- Or pick the missed pH row (scheduled ~21 days ago) on /compliance/defensible-miss
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_org constant uuid := 'f0000001-0001-4001-8001-000000000001'::uuid;
  v_site constant uuid := 'f0000002-0002-4002-8002-000000000002'::uuid;
  v_permit constant uuid := 'f0000003-0003-4003-8003-000000000003'::uuid;
  v_of1 constant uuid := 'f0000004-0004-4004-8004-000000000001'::uuid;
  v_of2 constant uuid := 'f0000004-0004-4004-8004-000000000002'::uuid;
  v_of3 constant uuid := 'f0000004-0004-4004-8004-000000000003'::uuid;
  v_param_ph constant uuid := 'ece2b187-d9ea-43ec-b786-e3525bea08ea'::uuid;

  v_sampler constant uuid := 'fe7979b3-3abd-4a00-8f4a-6d20757e4af4'::uuid;
  v_env constant uuid := 'a2930fca-1ffc-4209-805b-d0e84f3a065e'::uuid;

  v_event_before constant uuid := 'f0000501-0001-4001-8001-000000000001'::uuid;
  v_event_after constant uuid := 'f0000502-0002-4002-8002-000000000002'::uuid;
  v_lr_before constant uuid := 'f0000503-0003-4003-8003-000000000003'::uuid;
  v_lr_after constant uuid := 'f0000504-0004-4004-8004-000000000004'::uuid;

  v_fv_access1 constant uuid := 'f0000505-0005-4005-8005-000000000005'::uuid;
  v_fv_access2 constant uuid := 'f0000506-0006-4006-8006-000000000006'::uuid;
  v_fv_access3 constant uuid := 'f0000507-0007-4007-8007-000000000007'::uuid;
  v_fv_ok constant uuid := 'f0000508-0008-4008-8008-000000000008'::uuid;
  v_fv_golden_access constant uuid := 'f00000c3-0003-4003-8003-000000000003'::uuid;

  v_miss_date date;
  v_today date := CURRENT_DATE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org) THEN
    RAISE EXCEPTION 'UAT org missing — run scripts/seed-lane-a-wv-uat.sql first';
  END IF;

  -- Align with QW1 missed calendar row (v_today - 21)
  v_miss_date := v_today - 21;

  INSERT INTO sampling_events (
    id, outfall_id, site_id, sample_date, lab_name, status
  ) VALUES
    (
      v_event_before, v_of1, v_site, v_miss_date - 7,
      'Mineral Labs UAT', 'results_received'
    ),
    (
      v_event_after, v_of1, v_site, v_miss_date + 7,
      'Mineral Labs UAT', 'results_received'
    )
  ON CONFLICT (id) DO UPDATE SET
    sample_date = EXCLUDED.sample_date,
    lab_name = EXCLUDED.lab_name,
    status = EXCLUDED.status,
    updated_at = now();

  INSERT INTO lab_results (
    id, sampling_event_id, parameter_id, result_value, unit, analyzed_date
  ) VALUES
    (v_lr_before, v_event_before, v_param_ph, 7.1, 'SU', v_miss_date - 5),
    (v_lr_after, v_event_after, v_param_ph, 7.3, 'SU', v_miss_date + 9)
  ON CONFLICT (id) DO UPDATE SET
    result_value = EXCLUDED.result_value,
    analyzed_date = EXCLUDED.analyzed_date,
    updated_at = now();

  -- Field visits: insert assigned, attach required child rows, then complete (trigger-safe)
  INSERT INTO field_visits (
    id, organization_id, permit_id, outfall_id, assigned_to, assigned_by,
    scheduled_date, visit_status, field_notes
  ) VALUES
    (v_fv_access1, v_org, v_permit, v_of2, v_sampler, v_env, v_today - 60, 'assigned', 'QW3 UAT — road closed / gate locked'),
    (v_fv_access2, v_org, v_permit, v_of3, v_sampler, v_env, v_today - 30, 'assigned', 'QW3 UAT — haul road impassable after rain'),
    (v_fv_access3, v_org, v_permit, v_of1, v_sampler, v_env, v_today - 14, 'assigned', 'QW3 UAT — access denied by landowner'),
    (v_fv_ok, v_org, v_permit, v_of1, v_sampler, v_env, v_today - 7, 'assigned', 'QW3 UAT — successful sample for rate denominator')
  ON CONFLICT (id) DO UPDATE SET
    visit_status = 'assigned',
    outcome = NULL,
    scheduled_date = EXCLUDED.scheduled_date,
    field_notes = EXCLUDED.field_notes,
    updated_at = now();

  INSERT INTO access_issues (id, field_visit_id, issue_type, obstruction_narrative, created_by)
  VALUES
    ('f0000511-0001-4001-8001-000000000001'::uuid, v_fv_access1, 'road_blocked', 'Haul road closed — snow/ice (QW3 UAT)', v_sampler),
    ('f0000512-0002-4002-8002-000000000002'::uuid, v_fv_access2, 'road_blocked', 'Road washed out after rain (QW3 UAT)', v_sampler),
    ('f0000513-0003-4003-8003-000000000003'::uuid, v_fv_access3, 'locked_gate', 'Landowner denied access (QW3 UAT)', v_sampler),
    ('f0000514-0004-4004-8004-000000000004'::uuid, v_fv_golden_access, 'access_issue', 'Gate locked — UAT golden path (QW3)', v_sampler)
  ON CONFLICT (field_visit_id) DO UPDATE SET
    obstruction_narrative = EXCLUDED.obstruction_narrative,
    updated_at = now();

  INSERT INTO field_evidence_assets (
    id, organization_id, field_visit_id, evidence_type, bucket, storage_path, uploaded_by
  ) VALUES
    ('f0000521-0001-4001-8001-000000000001'::uuid, v_org, v_fv_access1, 'photo', 'field-inspections', 'uat/qw3/access1.jpg', v_sampler),
    ('f0000522-0002-4002-8002-000000000002'::uuid, v_org, v_fv_access2, 'photo', 'field-inspections', 'uat/qw3/access2.jpg', v_sampler),
    ('f0000523-0003-4003-8003-000000000003'::uuid, v_org, v_fv_access3, 'photo', 'field-inspections', 'uat/qw3/access3.jpg', v_sampler),
    ('f0000524-0004-4004-8004-000000000004'::uuid, v_org, v_fv_golden_access, 'photo', 'field-inspections', 'uat/qw3/golden-access.jpg', v_sampler)
  ON CONFLICT (id) DO UPDATE SET storage_path = EXCLUDED.storage_path;

  UPDATE field_visits SET
    visit_status = 'completed',
    outcome = 'access_issue',
    started_at = now() - interval '60 days' - interval '20 minutes',
    completed_at = now() - interval '60 days',
    started_latitude = 37.7750, started_longitude = -81.1859,
    completed_latitude = 37.7751, completed_longitude = -81.1860,
    updated_at = now()
  WHERE id = v_fv_access1;

  UPDATE field_visits SET
    visit_status = 'completed',
    outcome = 'access_issue',
    started_at = now() - interval '30 days' - interval '25 minutes',
    completed_at = now() - interval '30 days',
    started_latitude = 37.7752, started_longitude = -81.1861,
    completed_latitude = 37.7753, completed_longitude = -81.1862,
    updated_at = now()
  WHERE id = v_fv_access2;

  UPDATE field_visits SET
    visit_status = 'completed',
    outcome = 'access_issue',
    started_at = now() - interval '14 days' - interval '15 minutes',
    completed_at = now() - interval '14 days',
    started_latitude = 37.7754, started_longitude = -81.1863,
    completed_latitude = 37.7755, completed_longitude = -81.1864,
    updated_at = now()
  WHERE id = v_fv_access3;

  UPDATE field_visits SET
    visit_status = 'completed',
    outcome = 'access_issue',
    started_at = now() - interval '45 days' - interval '30 minutes',
    completed_at = now() - interval '45 days',
    started_latitude = 37.7748, started_longitude = -81.1856,
    completed_latitude = 37.7749, completed_longitude = -81.1857,
    updated_at = now()
  WHERE id = v_fv_golden_access;

  UPDATE field_visits SET
    visit_status = 'completed',
    outcome = 'sample_collected',
    linked_sampling_event_id = v_event_before,
    started_at = now() - interval '7 days' - interval '40 minutes',
    completed_at = now() - interval '7 days',
    started_latitude = 37.7756, started_longitude = -81.1865,
    completed_latitude = 37.7757, completed_longitude = -81.1866,
    updated_at = now()
  WHERE id = v_fv_ok;
END $$;

COMMIT;
