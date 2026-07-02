-- Slice 1 — synthetic UAT domain activation (DMR submission seed)
-- Label: SYNTHETIC_UAT_SLICE1 — not for regulatory submission.
-- Uses production CMS column names (reporting_period_*, dmr_submission_id on line items).
-- Repo import-netdmr-dmr targets newer columns pending ledger reconciliation (see BASELINE_ADOPTION.md).
-- Idempotent: skips when KYGE40869 Jan 2026 period already exists.

DO $$
DECLARE
  v_org_id constant uuid := '2bffc35c-e2c4-4396-868f-207f80e1e2c4'::uuid;
  v_permit_id constant uuid := '93e03251-017d-4c14-81cc-e1374ccd718c'::uuid;
  v_outfall_id constant uuid := '177d42b9-09ac-442f-82cc-be43bf636144'::uuid;
  v_parameter_id constant uuid := 'd1ee9a87-5fcc-4c5a-95a0-b26b3ba228cb'::uuid;
  v_import_id constant uuid := 'f0001001-0001-4001-8001-000000000001'::uuid;
  v_submission_id constant uuid := 'f0001002-0002-4002-8002-000000000002'::uuid;
  v_line_item_id constant uuid := 'f0001003-0003-4003-8003-000000000003'::uuid;
  v_period_start constant date := '2026-01-01'::date;
  v_period_end constant date := '2026-01-31'::date;
BEGIN
  IF EXISTS (
    SELECT 1 FROM dmr_submissions
    WHERE permit_id = v_permit_id
      AND reporting_period_start = v_period_start
      AND reporting_period_end = v_period_end
  ) THEN
    RAISE NOTICE 'Slice 1 synthetic DMR already seeded — skipping';
    RETURN;
  END IF;

  INSERT INTO data_imports (
    id,
    import_type,
    file_name,
    status,
    rows_imported,
    imported_by,
    started_at,
    completed_at,
    can_rollback,
    notes
  ) VALUES (
    v_import_id,
    'dmr_data',
    'slice1-synthetic-netdmr-kyge40869.csv',
    'completed',
    1,
    'b3d26e50-d74d-43c1-881d-526890c70d90'::uuid,
    now(),
    now(),
    true,
    '{"label":"SYNTHETIC_UAT_SLICE1","fixture":"supabase/seeds/uat/slice1-synthetic-netdmr-kyge40869.csv","note":"Domain activation seed — not regulatory data"}'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO dmr_submissions (
    id,
    permit_id,
    reporting_period_start,
    reporting_period_end,
    due_date,
    status,
    reporting_frequency,
    submission_method,
    submission_system,
    notes
  ) VALUES (
    v_submission_id,
    v_permit_id,
    v_period_start,
    v_period_end,
    '2026-02-28'::date,
    'draft',
    'monthly',
    'netdmr',
    'netdmr',
    'SYNTHETIC_UAT_SLICE1 — domain activation fixture for KYGE40869; not regulatory data'
  );

  INSERT INTO dmr_line_items (
    id,
    dmr_submission_id,
    outfall_id,
    parameter_id,
    concentration_max,
    concentration_units,
    permit_limit_max,
    number_of_samples,
    is_exceedance,
    no_discharge
  ) VALUES (
    v_line_item_id,
    v_submission_id,
    v_outfall_id,
    v_parameter_id,
    12.5,
    'mg/L',
    70,
    1,
    false,
    false
  );

  INSERT INTO audit_log (
    organization_id,
    action,
    module,
    table_name,
    record_id,
    new_values,
    description
  ) VALUES (
    v_org_id,
    'netdmr_dmr_imported',
    'environmental_compliance',
    'dmr_submissions',
    v_submission_id,
    jsonb_build_object(
      'label', 'SYNTHETIC_UAT_SLICE1',
      'permit_number', 'KYGE40869',
      'line_items', 1
    ),
    'Slice 1 synthetic DMR domain activation seed'
  );
END;
$$;
