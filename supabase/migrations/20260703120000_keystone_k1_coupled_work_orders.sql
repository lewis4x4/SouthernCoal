-- K1: Keystone §7.2 — no orphan alerts for QW2 ¶49, MSHA abatement, QW4 equipment PM.
-- Each detector persists an adverse-fact row and a coupled work_orders row in one transaction.

-- ---------------------------------------------------------------------------
-- 1. Extend work_orders.source_type
-- ---------------------------------------------------------------------------
ALTER TABLE public.work_orders
  DROP CONSTRAINT IF EXISTS work_orders_source_type_check;

ALTER TABLE public.work_orders
  ADD CONSTRAINT work_orders_source_type_check
  CHECK (source_type IN (
    'field_deficiency', 'inspection', 'incident', 'exceedance', 'manual',
    'sampling_gap', 'equipment_maintenance', 'edd_paragraph49', 'msha_abatement'
  ));

-- ---------------------------------------------------------------------------
-- 2. QW2 — work_order_id on edd_paragraph49_evaluations + atomic opener
-- ---------------------------------------------------------------------------
ALTER TABLE edd_paragraph49_evaluations
  ADD COLUMN IF NOT EXISTS work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_edd_p49_eval_work_order
  ON edd_paragraph49_evaluations(work_order_id)
  WHERE work_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION open_edd_paragraph49_with_work_order(
  p_organization_id uuid,
  p_evaluation_id uuid,
  p_is_late boolean,
  p_is_exceedance_only boolean,
  p_lab_name text,
  p_file_name text,
  p_hours numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wo_id uuid;
  v_priority text;
  v_title text;
  v_desc text;
BEGIN
  IF NOT p_is_late AND NOT p_is_exceedance_only THEN
    RETURN NULL;
  END IF;

  SELECT work_order_id INTO v_wo_id
  FROM edd_paragraph49_evaluations
  WHERE id = p_evaluation_id;

  IF v_wo_id IS NOT NULL THEN
    RETURN v_wo_id;
  END IF;

  v_priority := CASE
    WHEN p_is_late AND p_is_exceedance_only THEN 'critical'
    WHEN p_is_late THEN 'high'
    ELSE 'medium'
  END;

  v_title := format(
    'EDD ¶49: %s%s',
    CASE WHEN p_is_late THEN 'late 48h ' ELSE '' END,
    CASE WHEN p_is_exceedance_only THEN 'exceedance-only transmittal' ELSE 'review required' END
  );

  v_desc := format(
    'Auto-opened from CD ¶49 EDD evaluation. Lab: %s. File: %s. Hours analysis→arrival: %s. Review in Late & Incomplete EDD queue.',
    COALESCE(p_lab_name, 'unknown'),
    COALESCE(p_file_name, 'unknown'),
    COALESCE(p_hours::text, 'n/a')
  );

  INSERT INTO work_orders (
    organization_id,
    source_type,
    source_id,
    title,
    description,
    priority,
    status,
    due_date,
    decree_paragraphs
  ) VALUES (
    p_organization_id,
    'edd_paragraph49',
    p_evaluation_id,
    v_title,
    v_desc,
    v_priority,
    'open',
    CURRENT_DATE + 3,
    ARRAY['49']
  )
  RETURNING id INTO v_wo_id;

  INSERT INTO work_order_events (work_order_id, event_type, new_value, notes)
  VALUES (v_wo_id, 'created', 'open', 'Opened by CD ¶49 EDD evaluation detector');

  UPDATE edd_paragraph49_evaluations
  SET work_order_id = v_wo_id,
      transaction_time = now()
  WHERE id = p_evaluation_id;

  RETURN v_wo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION open_edd_paragraph49_with_work_order(
  uuid, uuid, boolean, boolean, text, text, numeric
) TO authenticated, service_role;

-- Rewrite evaluate_edd_import_paragraph49 — couple work order when flags fire
CREATE OR REPLACE FUNCTION evaluate_edd_import_paragraph49(
  p_import_id uuid,
  p_arrival_at timestamptz DEFAULT now(),
  p_source_file_id uuid DEFAULT NULL,
  p_file_name text DEFAULT NULL,
  p_lab_name text DEFAULT NULL,
  p_site_state text DEFAULT NULL
)
RETURNS edd_paragraph49_evaluations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_row edd_paragraph49_evaluations%ROWTYPE;
  v_earliest date;
  v_latest date;
  v_hours numeric;
  v_received integer := 0;
  v_expected integer := 0;
  v_exceedance integer := 0;
  v_events integer := 0;
  v_is_late boolean := false;
  v_is_exceedance_only boolean := false;
  v_lab text;
  v_state text;
BEGIN
  SELECT COALESCE(p.organization_id, si.organization_id)
  INTO v_org_id
  FROM lab_results lr
  JOIN sampling_events se ON se.id = lr.sampling_event_id
  JOIN outfalls o ON o.id = se.outfall_id
  LEFT JOIN npdes_permits p ON p.id = o.permit_id
  LEFT JOIN sites si ON si.id = COALESCE(se.site_id, o.site_id)
  WHERE lr.import_id = p_import_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    SELECT si.organization_id
    INTO v_org_id
    FROM data_imports di
    JOIN sites si ON si.id = di.site_id
    WHERE di.id = p_import_id;
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Import not found or organization could not be resolved: %', p_import_id;
  END IF;

  SELECT
    MIN(lr.analyzed_date),
    MAX(lr.analyzed_date),
    COUNT(DISTINCT (se.outfall_id, lr.parameter_id)),
    COUNT(DISTINCT se.id),
    MAX(se.lab_name),
    MAX(st.code)
  INTO v_earliest, v_latest, v_received, v_events, v_lab, v_state
  FROM lab_results lr
  JOIN sampling_events se ON se.id = lr.sampling_event_id
  JOIN outfalls o ON o.id = se.outfall_id
  LEFT JOIN sites si ON si.id = COALESCE(se.site_id, o.site_id)
  LEFT JOIN states st ON st.id = si.state_id
  WHERE lr.import_id = p_import_id;

  SELECT COUNT(DISTINCT (pl.outfall_id, pl.parameter_id)) INTO v_expected
  FROM permit_limits pl
  WHERE pl.outfall_id IN (
    SELECT DISTINCT se.outfall_id
    FROM lab_results lr
    JOIN sampling_events se ON se.id = lr.sampling_event_id
    WHERE lr.import_id = p_import_id
  );

  SELECT COUNT(DISTINCT (se.outfall_id, lr.parameter_id)) INTO v_exceedance
  FROM lab_results lr
  JOIN sampling_events se ON se.id = lr.sampling_event_id
  JOIN exceedances e ON e.lab_result_id = lr.id
  WHERE lr.import_id = p_import_id;

  IF v_latest IS NOT NULL THEN
    v_hours := ROUND(
      EXTRACT(EPOCH FROM (
        p_arrival_at - (v_latest::timestamptz + interval '23 hours 59 minutes 59 seconds')
      )) / 3600.0,
      2
    );
    v_is_late := v_hours > 48;
  END IF;

  IF v_received > 0 AND v_expected > 0 THEN
    v_is_exceedance_only := (v_exceedance = v_received AND v_received < v_expected);
  END IF;

  INSERT INTO edd_paragraph49_evaluations (
    organization_id,
    import_id,
    source_file_id,
    lab_name,
    site_state,
    file_name,
    arrival_at,
    earliest_analysis_date,
    latest_analysis_date,
    hours_analysis_to_arrival,
    is_late_48h,
    is_exceedance_only,
    parameters_received,
    parameters_expected,
    exceedance_parameter_count,
    sampling_event_count,
    valid_from,
    transaction_time,
    updated_at
  ) VALUES (
    v_org_id,
    p_import_id,
    p_source_file_id,
    COALESCE(p_lab_name, v_lab),
    COALESCE(p_site_state, v_state),
    p_file_name,
    p_arrival_at,
    v_earliest,
    v_latest,
    v_hours,
    v_is_late,
    v_is_exceedance_only,
    COALESCE(v_received, 0),
    COALESCE(v_expected, 0),
    COALESCE(v_exceedance, 0),
    COALESCE(v_events, 0),
    now(),
    now(),
    now()
  )
  ON CONFLICT (import_id) WHERE import_id IS NOT NULL
  DO UPDATE SET
    source_file_id = EXCLUDED.source_file_id,
    lab_name = EXCLUDED.lab_name,
    site_state = EXCLUDED.site_state,
    file_name = EXCLUDED.file_name,
    arrival_at = EXCLUDED.arrival_at,
    earliest_analysis_date = EXCLUDED.earliest_analysis_date,
    latest_analysis_date = EXCLUDED.latest_analysis_date,
    hours_analysis_to_arrival = EXCLUDED.hours_analysis_to_arrival,
    is_late_48h = EXCLUDED.is_late_48h,
    is_exceedance_only = EXCLUDED.is_exceedance_only,
    parameters_received = EXCLUDED.parameters_received,
    parameters_expected = EXCLUDED.parameters_expected,
    exceedance_parameter_count = EXCLUDED.exceedance_parameter_count,
    sampling_event_count = EXCLUDED.sampling_event_count,
    transaction_time = now(),
    updated_at = now()
  RETURNING * INTO v_row;

  IF v_is_late OR v_is_exceedance_only THEN
    PERFORM open_edd_paragraph49_with_work_order(
      v_org_id,
      v_row.id,
      v_is_late,
      v_is_exceedance_only,
      v_row.lab_name,
      v_row.file_name,
      v_hours
    );
    SELECT * INTO v_row FROM edd_paragraph49_evaluations WHERE id = v_row.id;
  END IF;

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
    'edd_paragraph49_evaluated',
    'environmental_compliance',
    'edd_paragraph49_evaluations',
    v_row.id,
    jsonb_build_object(
      'import_id', p_import_id,
      'is_late_48h', v_is_late,
      'is_exceedance_only', v_is_exceedance_only,
      'work_order_id', v_row.work_order_id
    ),
    'CD ¶49 EDD evaluation on ingest (advisory)'
  );

  RETURN v_row;
END;
$$;

-- Backfill work orders for existing flagged evaluations missing one
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id, organization_id, is_late_48h, is_exceedance_only, lab_name, file_name,
           hours_analysis_to_arrival
    FROM edd_paragraph49_evaluations
    WHERE work_order_id IS NULL
      AND (is_late_48h OR is_exceedance_only)
      AND review_status = 'pending'
  LOOP
    PERFORM open_edd_paragraph49_with_work_order(
      rec.organization_id,
      rec.id,
      rec.is_late_48h,
      rec.is_exceedance_only,
      rec.lab_name,
      rec.file_name,
      rec.hours_analysis_to_arrival
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. MSHA abatement adverse-fact ledger + detector
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS msha_abatement_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL REFERENCES external_msha_inspections(id) ON DELETE CASCADE,
  mine_id text NOT NULL,
  violation_number text NOT NULL,
  abatement_due_date date NOT NULL,
  days_until_due integer NOT NULL,
  urgency text NOT NULL CHECK (urgency IN ('overdue', 'due_soon')),
  significant_substantial boolean NOT NULL DEFAULT false,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'acknowledged', 'resolved')),
  work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  transaction_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_msha_abatement_alerts_open_inspection
  ON msha_abatement_alerts(inspection_id)
  WHERE review_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_msha_abatement_alerts_org_status
  ON msha_abatement_alerts(organization_id, review_status, urgency);

ALTER TABLE msha_abatement_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read org msha abatement alerts" ON msha_abatement_alerts;
CREATE POLICY "Authenticated read org msha abatement alerts"
  ON msha_abatement_alerts FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "Service role full msha abatement alerts" ON msha_abatement_alerts;
CREATE POLICY "Service role full msha abatement alerts"
  ON msha_abatement_alerts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION open_msha_abatement_with_work_order(
  p_organization_id uuid,
  p_inspection_id uuid,
  p_mine_id text,
  p_violation_number text,
  p_abatement_due_date date,
  p_days_until_due integer,
  p_urgency text,
  p_significant_substantial boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert_id uuid;
  v_wo_id uuid;
  v_priority text;
  v_title text;
BEGIN
  SELECT id INTO v_alert_id
  FROM msha_abatement_alerts
  WHERE inspection_id = p_inspection_id
    AND review_status = 'pending'
  LIMIT 1;

  IF v_alert_id IS NOT NULL THEN
    RETURN v_alert_id;
  END IF;

  v_priority := CASE
    WHEN p_urgency = 'overdue' AND p_significant_substantial THEN 'critical'
    WHEN p_urgency = 'overdue' THEN 'high'
    WHEN p_significant_substantial THEN 'high'
    ELSE 'medium'
  END;

  v_title := format(
    'MSHA abatement %s: mine %s citation %s (%s days)',
    p_urgency,
    p_mine_id,
    p_violation_number,
    p_days_until_due
  );

  INSERT INTO work_orders (
    organization_id,
    source_type,
    title,
    description,
    priority,
    status,
    due_date
  ) VALUES (
    p_organization_id,
    'msha_abatement',
    v_title,
    format(
      'Auto-opened from MSHA abatement detector. Due %s. Review in MSHA Coverage panel.',
      p_abatement_due_date
    ),
    v_priority,
    'open',
    GREATEST(p_abatement_due_date, CURRENT_DATE)
  )
  RETURNING id INTO v_wo_id;

  INSERT INTO work_order_events (work_order_id, event_type, new_value, notes)
  VALUES (v_wo_id, 'created', 'open', 'Opened by MSHA abatement detector');

  INSERT INTO msha_abatement_alerts (
    organization_id,
    inspection_id,
    mine_id,
    violation_number,
    abatement_due_date,
    days_until_due,
    urgency,
    significant_substantial,
    work_order_id,
    valid_from,
    transaction_time
  ) VALUES (
    p_organization_id,
    p_inspection_id,
    p_mine_id,
    p_violation_number,
    p_abatement_due_date,
    p_days_until_due,
    p_urgency,
    p_significant_substantial,
    v_wo_id,
    now(),
    now()
  )
  RETURNING id INTO v_alert_id;

  UPDATE work_orders SET source_id = v_alert_id WHERE id = v_wo_id;

  RETURN v_alert_id;
END;
$$;

GRANT EXECUTE ON FUNCTION open_msha_abatement_with_work_order(
  uuid, uuid, text, text, date, integer, text, boolean
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION detect_msha_abatement_alerts(
  p_organization_id uuid,
  p_days_ahead integer DEFAULT 14,
  p_source text DEFAULT 'scheduled'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, get_user_org_id());
  v_opened integer := 0;
  rec RECORD;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;

  FOR rec IN
    SELECT * FROM get_msha_abatement_at_risk(v_org_id, p_days_ahead)
  LOOP
    PERFORM open_msha_abatement_with_work_order(
      v_org_id,
      rec.id,
      rec.mine_id,
      rec.violation_number,
      rec.abatement_due_date,
      rec.days_until_due,
      rec.urgency,
      rec.significant_substantial
    );
    v_opened := v_opened + 1;
  END LOOP;

  INSERT INTO audit_log (
    organization_id, action, module, table_name, new_values, description
  ) VALUES (
    v_org_id,
    'msha_abatement_detection_completed',
    'external_data',
    'msha_abatement_alerts',
    jsonb_build_object('opened', v_opened, 'source', p_source),
    'MSHA abatement alert detection run'
  );

  RETURN jsonb_build_object('organization_id', v_org_id, 'opened', v_opened);
END;
$$;

GRANT EXECUTE ON FUNCTION detect_msha_abatement_alerts(uuid, integer, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. QW4 equipment maintenance adverse-fact ledger + detector
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipment_maintenance_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES equipment_catalog(id) ON DELETE CASCADE,
  equipment_name text NOT NULL,
  next_maintenance_due date,
  days_until_due integer,
  urgency text NOT NULL CHECK (urgency IN ('overdue', 'due_soon', 'unknown')),
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'acknowledged', 'resolved')),
  work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  transaction_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_maint_alerts_open_equipment
  ON equipment_maintenance_alerts(equipment_id)
  WHERE review_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_equipment_maint_alerts_org
  ON equipment_maintenance_alerts(organization_id, review_status, urgency);

ALTER TABLE equipment_maintenance_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read org equipment maint alerts" ON equipment_maintenance_alerts;
CREATE POLICY "Authenticated read org equipment maint alerts"
  ON equipment_maintenance_alerts FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "Service role full equipment maint alerts" ON equipment_maintenance_alerts;
CREATE POLICY "Service role full equipment maint alerts"
  ON equipment_maintenance_alerts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION open_equipment_maintenance_with_work_order(
  p_organization_id uuid,
  p_equipment_id uuid,
  p_equipment_name text,
  p_next_due date,
  p_days_until integer,
  p_urgency text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert_id uuid;
  v_wo_id uuid;
  v_priority text;
BEGIN
  SELECT id INTO v_alert_id
  FROM equipment_maintenance_alerts
  WHERE equipment_id = p_equipment_id
    AND review_status = 'pending'
  LIMIT 1;

  IF v_alert_id IS NOT NULL THEN
    RETURN v_alert_id;
  END IF;

  v_priority := CASE p_urgency
    WHEN 'overdue' THEN 'high'
    WHEN 'due_soon' THEN 'medium'
    ELSE 'low'
  END;

  INSERT INTO work_orders (
    organization_id,
    source_type,
    title,
    description,
    priority,
    status,
    due_date,
    category
  ) VALUES (
    p_organization_id,
    'equipment_maintenance',
    format('Field gear PM %s: %s', p_urgency, p_equipment_name),
    format(
      'Auto-opened from equipment PM detector. Next due: %s. Review overdue gear list.',
      COALESCE(p_next_due::text, 'unknown')
    ),
    v_priority,
    'open',
    COALESCE(p_next_due, CURRENT_DATE + 7),
    'equipment_repair'
  )
  RETURNING id INTO v_wo_id;

  INSERT INTO work_order_events (work_order_id, event_type, new_value, notes)
  VALUES (v_wo_id, 'created', 'open', 'Opened by equipment PM detector (QW4)');

  INSERT INTO equipment_maintenance_alerts (
    organization_id,
    equipment_id,
    equipment_name,
    next_maintenance_due,
    days_until_due,
    urgency,
    work_order_id,
    valid_from,
    transaction_time
  ) VALUES (
    p_organization_id,
    p_equipment_id,
    p_equipment_name,
    p_next_due,
    p_days_until,
    p_urgency,
    v_wo_id,
    now(),
    now()
  )
  RETURNING id INTO v_alert_id;

  UPDATE work_orders SET source_id = v_alert_id WHERE id = v_wo_id;

  RETURN v_alert_id;
END;
$$;

GRANT EXECUTE ON FUNCTION open_equipment_maintenance_with_work_order(
  uuid, uuid, text, date, integer, text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION detect_equipment_maintenance_gaps(
  p_organization_id uuid,
  p_within_days integer DEFAULT 14,
  p_source text DEFAULT 'scheduled'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, get_user_org_id());
  v_opened integer := 0;
  rec RECORD;
  v_urgency text;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;

  FOR rec IN
    SELECT * FROM get_equipment_due_maintenance(v_org_id, p_within_days)
  LOOP
    v_urgency := CASE
      WHEN rec.next_maintenance_due IS NULL THEN 'unknown'
      WHEN rec.days_until_due < 0 THEN 'overdue'
      ELSE 'due_soon'
    END;

    PERFORM open_equipment_maintenance_with_work_order(
      v_org_id,
      rec.equipment_id,
      rec.equipment_name,
      rec.next_maintenance_due,
      rec.days_until_due,
      v_urgency
    );
    v_opened := v_opened + 1;
  END LOOP;

  INSERT INTO audit_log (
    organization_id, action, module, table_name, new_values, description
  ) VALUES (
    v_org_id,
    'equipment_maintenance_detection_completed',
    'environmental_compliance',
    'equipment_maintenance_alerts',
    jsonb_build_object('opened', v_opened, 'source', p_source),
    'Field gear PM overdue detection (QW4)'
  );

  RETURN jsonb_build_object('organization_id', v_org_id, 'opened', v_opened);
END;
$$;

GRANT EXECUTE ON FUNCTION detect_equipment_maintenance_gaps(uuid, integer, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Nightly cron wrappers + scheduled_jobs catalog entries
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION run_msha_abatement_detection_nightly()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org organizations%ROWTYPE;
  v_count integer := 0;
  v_run_id uuid;
BEGIN
  v_run_id := begin_job_run('detect-msha-abatement-nightly', NULL);
  BEGIN
    FOR v_org IN SELECT id FROM organizations ORDER BY id LOOP
      PERFORM detect_msha_abatement_alerts(v_org.id, 14, 'scheduled');
      v_count := v_count + 1;
    END LOOP;
    PERFORM complete_job_run(v_run_id, 'succeeded', v_count, v_count, NULL);
    RETURN v_count;
  EXCEPTION WHEN OTHERS THEN
    PERFORM complete_job_run(v_run_id, 'failed', v_count, v_count, SQLERRM);
    RAISE;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION run_equipment_maintenance_detection_nightly()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org organizations%ROWTYPE;
  v_count integer := 0;
  v_run_id uuid;
BEGIN
  v_run_id := begin_job_run('detect-equipment-maintenance-nightly', NULL);
  BEGIN
    FOR v_org IN SELECT id FROM organizations ORDER BY id LOOP
      PERFORM detect_equipment_maintenance_gaps(v_org.id, 14, 'scheduled');
      v_count := v_count + 1;
    END LOOP;
    PERFORM complete_job_run(v_run_id, 'succeeded', v_count, v_count, NULL);
    RETURN v_count;
  EXCEPTION WHEN OTHERS THEN
    PERFORM complete_job_run(v_run_id, 'failed', v_count, v_count, SQLERRM);
    RAISE;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION run_msha_abatement_detection_nightly() TO service_role;
GRANT EXECUTE ON FUNCTION run_equipment_maintenance_detection_nightly() TO service_role;

INSERT INTO scheduled_jobs (job_name, display_name, cadence_hours, sort_order) VALUES
  ('detect-msha-abatement-nightly', 'MSHA abatement detection', 26, 95),
  ('detect-equipment-maintenance-nightly', 'Equipment PM detection', 26, 96)
ON CONFLICT (job_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  cadence_hours = EXCLUDED.cadence_hours,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

SELECT cron.unschedule('detect-msha-abatement-nightly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-msha-abatement-nightly');

SELECT cron.schedule(
  'detect-msha-abatement-nightly',
  '15 4 * * *',
  $$ SELECT public.run_msha_abatement_detection_nightly(); $$
);

SELECT cron.unschedule('detect-equipment-maintenance-nightly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-equipment-maintenance-nightly');

SELECT cron.schedule(
  'detect-equipment-maintenance-nightly',
  '45 4 * * *',
  $$ SELECT public.run_equipment_maintenance_detection_nightly(); $$
);

COMMENT ON TABLE msha_abatement_alerts IS
  'Keystone §7.2 MSHA adverse-fact ledger — each row coupled to a work_order at insert.';
COMMENT ON TABLE equipment_maintenance_alerts IS
  'Keystone §7.2 QW4 field-gear PM adverse-fact ledger — coupled work_orders at insert.';

-- Allow cron/service_role to call get_equipment_due_maintenance with explicit org
CREATE OR REPLACE FUNCTION get_equipment_due_maintenance(
  p_org_id uuid,
  p_within_days integer DEFAULT 14
) RETURNS TABLE (
  equipment_id uuid,
  equipment_name text,
  equipment_type text,
  serial_number text,
  last_serviced_at timestamptz,
  next_maintenance_due date,
  days_until_due integer,
  assigned_to_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org uuid;
BEGIN
  v_caller_org := get_user_org_id();

  IF v_caller_org IS NOT NULL AND p_org_id IS DISTINCT FROM v_caller_org THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    ec.id AS equipment_id,
    ec.name AS equipment_name,
    ec.equipment_type,
    ec.serial_number,
    ml.performed_at AS last_serviced_at,
    ml.next_maintenance_due,
    (ml.next_maintenance_due - CURRENT_DATE)::integer AS days_until_due,
    COALESCE(up.first_name || ' ' || up.last_name, up.email) AS assigned_to_name
  FROM equipment_catalog ec
  LEFT JOIN LATERAL (
    SELECT ml2.performed_at, ml2.next_maintenance_due
    FROM maintenance_logs ml2
    WHERE ml2.equipment_id = ec.id
    ORDER BY ml2.performed_at DESC
    LIMIT 1
  ) ml ON true
  LEFT JOIN equipment_assignments ea
    ON ea.equipment_id = ec.id AND ea.returned_at IS NULL
  LEFT JOIN user_profiles up ON up.id = ea.assigned_to
  WHERE ec.organization_id = p_org_id
    AND ec.is_active = true
    AND (
      ml.next_maintenance_due IS NULL
      OR ml.next_maintenance_due <= CURRENT_DATE + p_within_days
    );
END;
$$;
