-- =============================================================================
-- Lane C QW2 — synthetic EDD ¶49 flags for UAT demo
-- =============================================================================
-- Prerequisites: scripts/seed-lane-a-wv-uat.sql applied.
--
-- Creates two lab imports evaluated via evaluate_edd_import_paragraph49:
--   1. Late >48h (analysis 5 days before arrival)
--   2. Exceedance-only transmittal (2 of 5 expected params, all exceedances)
--
-- After seeding:
--   SELECT evaluate_edd_import_paragraph49('f0000301-0001-4001-8001-000000000001'::uuid);
--   SELECT evaluate_edd_import_paragraph49('f0000302-0002-4002-8002-000000000002'::uuid);
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_org constant uuid := 'f0000001-0001-4001-8001-000000000001'::uuid;
  v_site constant uuid := 'f0000002-0002-4002-8002-000000000002'::uuid;
  v_permit constant uuid := 'f0000003-0003-4003-8003-000000000003'::uuid;
  v_of1 constant uuid := 'f0000004-0004-4004-8004-000000000001'::uuid;

  v_param_ph constant uuid := 'ece2b187-d9ea-43ec-b786-e3525bea08ea'::uuid;
  v_param_tss constant uuid := 'd1ee9a87-5fcc-4c5a-95a0-b26b3ba228cb'::uuid;
  v_param_temp constant uuid := 'b65cc464-c6f6-4738-95c3-fbd1a587a29d'::uuid;
  v_param_iron constant uuid := '353e3d5f-6577-4d51-8f72-b3f39625b0d0'::uuid;
  v_param_mn constant uuid := 'fd89fad4-fbda-40ef-84ed-beec518921b1'::uuid;

  v_import_late constant uuid := 'f0000301-0001-4001-8001-000000000001'::uuid;
  v_import_exceed constant uuid := 'f0000302-0002-4002-8002-000000000002'::uuid;
  v_event_late constant uuid := 'f0000303-0003-4003-8003-000000000003'::uuid;
  v_event_exceed constant uuid := 'f0000304-0004-4004-8004-000000000004'::uuid;
  v_lr_late constant uuid := 'f0000305-0005-4005-8005-000000000005'::uuid;
  v_lr_ex_ph constant uuid := 'f0000306-0006-4006-8006-000000000006'::uuid;
  v_lr_ex_tss constant uuid := 'f0000307-0007-4007-8007-000000000007'::uuid;

  v_pl_ph constant uuid := 'f0000311-0001-4001-8001-000000000001'::uuid;
  v_pl_tss constant uuid := 'f0000312-0002-4002-8002-000000000002'::uuid;
  v_pl_temp constant uuid := 'f0000313-0003-4003-8003-000000000003'::uuid;
  v_pl_iron constant uuid := 'f0000314-0004-4004-8004-000000000004'::uuid;
  v_pl_mn constant uuid := 'f0000315-0005-4005-8005-000000000005'::uuid;

  v_today date := CURRENT_DATE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org) THEN
    RAISE EXCEPTION 'UAT org missing — run scripts/seed-lane-a-wv-uat.sql first';
  END IF;

  INSERT INTO permit_limits (
    id, permit_id, outfall_id, parameter_id, limit_type, limit_value, limit_min, limit_max, unit, is_active
  ) VALUES
    (v_pl_ph, v_permit, v_of1, v_param_ph, 'range', 9.0, 6.0, 9.0, 'SU', true),
    (v_pl_tss, v_permit, v_of1, v_param_tss, 'monthly_avg', 35.0, 'mg/L', true),
    (v_pl_temp, v_permit, v_of1, v_param_temp, 'instantaneous_max', 90.0, 'degF', true),
    (v_pl_iron, v_permit, v_of1, v_param_iron, 'monthly_avg', 3.0, 'mg/L', true),
    (v_pl_mn, v_permit, v_of1, v_param_mn, 'monthly_avg', 1.0, 'mg/L', true)
  ON CONFLICT (id) DO UPDATE SET
    is_active = EXCLUDED.is_active,
    limit_min = EXCLUDED.limit_min,
    limit_max = EXCLUDED.limit_max,
    updated_at = now();

  INSERT INTO data_imports (id, site_id, import_type, file_name, status, completed_at)
  VALUES
    (v_import_late, v_site, 'lab_results', 'qw2-uat-late.edd', 'completed', now()),
    (v_import_exceed, v_site, 'lab_results', 'qw2-uat-exceedance-only.edd', 'completed', now())
  ON CONFLICT (id) DO UPDATE SET
    site_id = EXCLUDED.site_id,
    file_name = EXCLUDED.file_name,
    status = EXCLUDED.status,
    completed_at = EXCLUDED.completed_at;

  INSERT INTO sampling_events (
    id, outfall_id, site_id, sample_date, lab_name, status
  ) VALUES
    (v_event_late, v_of1, v_site, v_today - 5, 'Mineral Labs UAT', 'results_received'),
    (v_event_exceed, v_of1, v_site, v_today - 1, 'Aquatic UAT', 'results_received')
  ON CONFLICT (id) DO UPDATE SET
    sample_date = EXCLUDED.sample_date,
    lab_name = EXCLUDED.lab_name,
    status = EXCLUDED.status,
    updated_at = now();

  INSERT INTO lab_results (
    id, sampling_event_id, parameter_id, result_value, unit, analyzed_date, import_id
  ) VALUES
    (v_lr_late, v_event_late, v_param_ph, 7.2, 'SU', v_today - 5, v_import_late),
    (v_lr_ex_ph, v_event_exceed, v_param_ph, 4.1, 'SU', v_today - 1, v_import_exceed),
    (v_lr_ex_tss, v_event_exceed, v_param_tss, 120.0, 'mg/L', v_today - 1, v_import_exceed)
  ON CONFLICT (id) DO UPDATE SET
    analyzed_date = EXCLUDED.analyzed_date,
    import_id = EXCLUDED.import_id,
    result_value = EXCLUDED.result_value,
    updated_at = now();

  -- Exceedances for exceedance-only import are auto-created by trg_detect_exceedance
  -- when lab_results with out-of-limit values are inserted above.

  PERFORM evaluate_edd_import_paragraph49(
    v_import_late,
    now(),
    NULL,
    'qw2-uat-late.edd',
    'Mineral Labs UAT',
    'WV'
  );

  PERFORM evaluate_edd_import_paragraph49(
    v_import_exceed,
    now(),
    NULL,
    'qw2-uat-exceedance-only.edd',
    'Aquatic UAT',
    'WV'
  );
END $$;

COMMIT;
