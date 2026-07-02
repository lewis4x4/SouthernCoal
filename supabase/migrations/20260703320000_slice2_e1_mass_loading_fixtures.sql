-- Slice 2 E1 — synthetic fixtures for mass loading (lbs/day) acceptance on KYGE40869 Jan 2026.
-- Label: SYNTHETIC_UAT_SLICE2_E1 — not for regulatory submission.
-- Idempotent: skips when quantity limit + flow lab result already seeded.

DO $$
DECLARE
  v_org_id constant uuid := '2bffc35c-e2c4-4396-868f-207f80e1e2c4'::uuid;
  v_permit_id constant uuid := '93e03251-017d-4c14-81cc-e1374ccd718c'::uuid;
  v_outfall_id constant uuid := '177d42b9-09ac-442f-82cc-be43bf636144'::uuid;
  v_tss_parameter_id constant uuid := 'd1ee9a87-5fcc-4c5a-95a0-b26b3ba228cb'::uuid;
  v_flow_parameter_id constant uuid := 'e51f7c7a-4dea-4849-bc1b-3a016f2da2ab'::uuid;
  v_quantity_limit_id constant uuid := 'f0002005-0005-4005-8005-000000000005'::uuid;
  v_existing_event_id constant uuid := 'f0002001-0001-4001-8001-000000000001'::uuid;
  v_flow_result_id constant uuid := 'f0002004-0004-4004-8004-000000000004'::uuid;
  v_flow_mgd constant numeric := 2.5;
  v_sample_date constant date := '2026-01-15'::date;
BEGIN
  IF EXISTS (
    SELECT 1 FROM permit_limits pl
    WHERE pl.id = v_quantity_limit_id
      OR (
        pl.outfall_id = v_outfall_id
        AND pl.parameter_id = v_tss_parameter_id
        AND lower(COALESCE(pl.unit, '')) LIKE '%lb%day%'
        AND pl.condition_notes LIKE '%SYNTHETIC_UAT_SLICE2_E1%'
      )
  ) THEN
    RAISE NOTICE 'Slice 2 E1 quantity limit fixture already seeded — skipping limit insert';
  ELSE
    INSERT INTO permit_limits (
      id,
      permit_id,
      outfall_id,
      parameter_id,
      limit_type,
      limit_value,
      limit_max,
      unit,
      statistical_base,
      is_active,
      review_status,
      condition_notes,
      storet_code,
      extraction_confidence
    ) VALUES (
      v_quantity_limit_id,
      v_permit_id,
      v_outfall_id,
      v_tss_parameter_id,
      'daily_max',
      500,
      500,
      'lbs/day',
      'Q1',
      true,
      'pending_review',
      'SYNTHETIC_UAT_SLICE2_E1 — quantity-type TSS limit for mass loading acceptance; verify against permit PDF',
      '00530',
      0.5
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF EXISTS (
    SELECT 1 FROM lab_results lr
    WHERE lr.sampling_event_id = v_existing_event_id
      AND lr.parameter_id = v_flow_parameter_id
      AND lr.result_value = v_flow_mgd
      AND lower(COALESCE(lr.unit, '')) = 'mgd'
  ) THEN
    RAISE NOTICE 'Slice 2 E1 flow lab fixture already seeded — skipping';
  ELSE
    INSERT INTO lab_results (
      id, sampling_event_id, parameter_id, result_value, unit, is_non_detect
    ) VALUES (
      v_flow_result_id, v_existing_event_id, v_flow_parameter_id, v_flow_mgd, 'MGD', false
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO audit_log (
    organization_id, action, module, table_name, record_id, new_values, description
  ) VALUES (
    v_org_id,
    'lab_data_imported',
    'environmental_compliance',
    'lab_results',
    v_flow_result_id,
    jsonb_build_object(
      'label', 'SYNTHETIC_UAT_SLICE2_E1',
      'outfall_id', v_outfall_id,
      'parameter', 'Flow',
      'result_value', v_flow_mgd,
      'unit', 'MGD',
      'sample_date', v_sample_date,
      'quantity_limit_id', v_quantity_limit_id
    ),
    'Slice 2 E1 synthetic flow + quantity limit fixtures for DMR mass loading acceptance (KYGE40869 Jan 2026)'
  );
END;
$$;
