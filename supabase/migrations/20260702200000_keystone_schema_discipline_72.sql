-- Roadmap §7.2 schema discipline: bitemporal columns, coupled work_orders, penalty citations
-- Applies retrofits to Lane C QW1 gap detector and draft penalty ledger.

-- ---------------------------------------------------------------------------
-- 1. Extend work_orders.source_type for sampling-gap alerts
-- ---------------------------------------------------------------------------
ALTER TABLE public.work_orders
  DROP CONSTRAINT IF EXISTS work_orders_source_type_check;

ALTER TABLE public.work_orders
  ADD CONSTRAINT work_orders_source_type_check
  CHECK (source_type IN (
    'field_deficiency', 'inspection', 'incident', 'exceedance', 'manual',
    'sampling_gap', 'equipment_maintenance'
  ));

-- ---------------------------------------------------------------------------
-- 2. Bitemporal + work_order coupling on sampling_gap_records
-- ---------------------------------------------------------------------------
ALTER TABLE sampling_gap_records
  ADD COLUMN IF NOT EXISTS valid_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS valid_to timestamptz,
  ADD COLUMN IF NOT EXISTS transaction_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sampling_gap_records_work_order
  ON sampling_gap_records(work_order_id)
  WHERE work_order_id IS NOT NULL;

COMMENT ON COLUMN sampling_gap_records.valid_from IS
  'Keystone §7.2 valid time — when the gap condition became true in the field.';
COMMENT ON COLUMN sampling_gap_records.transaction_time IS
  'Keystone §7.2 transaction time — when the system first recorded the gap.';

-- Backfill coupled work orders for open gaps missing one (same transaction per row)
DO $$
DECLARE
  rec RECORD;
  v_wo_id uuid;
  v_priority text;
  v_title text;
BEGIN
  FOR rec IN
    SELECT
      sgr.id AS gap_id,
      sgr.organization_id,
      sgr.outfall_id,
      sgr.gap_kind,
      sgr.severity,
      sgr.scheduled_date,
      sgr.days_late,
      o.outfall_number,
      p.short_name AS parameter_short_name
    FROM sampling_gap_records sgr
    JOIN outfalls o ON o.id = sgr.outfall_id
    JOIN parameters p ON p.id = sgr.parameter_id
    WHERE sgr.review_status <> 'resolved'
      AND sgr.work_order_id IS NULL
  LOOP
    v_priority := CASE rec.severity
      WHEN 'critical' THEN 'critical'
      WHEN 'high' THEN 'high'
      WHEN 'medium' THEN 'medium'
      ELSE 'low'
    END;

    v_title := format(
      'Sampling gap: %s %s (%s, %s days late)',
      rec.outfall_number,
      rec.parameter_short_name,
      rec.gap_kind,
      rec.days_late
    );

    INSERT INTO work_orders (
      organization_id,
      source_type,
      source_id,
      outfall_id,
      title,
      description,
      priority,
      status,
      due_date
    ) VALUES (
      rec.organization_id,
      'sampling_gap',
      rec.gap_id,
      rec.outfall_id,
      v_title,
      format(
        'Auto-opened from calendar-gap detector. Scheduled %s. Review in Missed / At-Risk queue.',
        rec.scheduled_date
      ),
      v_priority,
      'open',
      CURRENT_DATE + 7
    )
    RETURNING id INTO v_wo_id;

    INSERT INTO work_order_events (work_order_id, event_type, new_value, notes)
    VALUES (v_wo_id, 'created', 'open', 'Backfilled from §7.2 schema discipline migration');

    UPDATE sampling_gap_records
    SET work_order_id = v_wo_id,
        transaction_time = COALESCE(transaction_time, now())
    WHERE id = rec.gap_id;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Helper — open gap + work order atomically
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION open_sampling_gap_with_work_order(
  p_organization_id uuid,
  p_detection_run_id uuid,
  p_calendar_id uuid,
  p_gap_kind text,
  p_severity text,
  p_scheduled_date date,
  p_window_end date,
  p_days_late integer,
  p_dispatch_status text,
  p_calendar_status text,
  p_field_visit_outcome text,
  p_field_visit_status text,
  p_skip_reason text,
  p_outfall_id uuid,
  p_parameter_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gap_id uuid;
  v_wo_id uuid;
  v_priority text;
  v_title text;
  v_outfall_number text;
  v_parameter_short_name text;
BEGIN
  SELECT o.outfall_number, p.short_name
  INTO v_outfall_number, v_parameter_short_name
  FROM outfalls o, parameters p
  WHERE o.id = p_outfall_id
    AND p.id = p_parameter_id;

  v_priority := CASE p_severity
    WHEN 'critical' THEN 'critical'
    WHEN 'high' THEN 'high'
    WHEN 'medium' THEN 'medium'
    ELSE 'low'
  END;

  v_title := format(
    'Sampling gap: %s %s (%s, %s days late)',
    COALESCE(v_outfall_number, 'outfall'),
    COALESCE(v_parameter_short_name, 'parameter'),
    p_gap_kind,
    p_days_late
  );

  INSERT INTO work_orders (
    organization_id,
    source_type,
    outfall_id,
    title,
    description,
    priority,
    status,
    due_date
  ) VALUES (
    p_organization_id,
    'sampling_gap',
    p_outfall_id,
    v_title,
    format(
      'Auto-opened from calendar-gap detector. Scheduled %s. Review in Missed / At-Risk queue.',
      p_scheduled_date
    ),
    v_priority,
    'open',
    CURRENT_DATE + 7
  )
  RETURNING id INTO v_wo_id;

  INSERT INTO work_order_events (work_order_id, event_type, new_value, notes)
  VALUES (v_wo_id, 'created', 'open', 'Opened by sampling calendar gap detector');

  INSERT INTO sampling_gap_records (
    organization_id,
    calendar_id,
    detection_run_id,
    gap_kind,
    severity,
    scheduled_date,
    window_end,
    days_late,
    dispatch_status,
    calendar_status,
    field_visit_outcome,
    field_visit_status,
    skip_reason,
    outfall_id,
    parameter_id,
    work_order_id,
    valid_from,
    transaction_time
  ) VALUES (
    p_organization_id,
    p_calendar_id,
    p_detection_run_id,
    p_gap_kind,
    p_severity,
    p_scheduled_date,
    p_window_end,
    p_days_late,
    p_dispatch_status,
    p_calendar_status,
    p_field_visit_outcome,
    p_field_visit_status,
    p_skip_reason,
    p_outfall_id,
    p_parameter_id,
    v_wo_id,
    now(),
    now()
  )
  RETURNING id INTO v_gap_id;

  UPDATE work_orders
  SET source_id = v_gap_id
  WHERE id = v_wo_id;

  RETURN v_gap_id;
END;
$$;

GRANT EXECUTE ON FUNCTION open_sampling_gap_with_work_order(
  uuid, uuid, uuid, text, text, date, date, integer, text, text, text, text, text, uuid, uuid
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Replace detect_sampling_calendar_gaps — coupled work orders, valid_to on resolve
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION detect_sampling_calendar_gaps(
  p_organization_id uuid DEFAULT NULL,
  p_as_of date DEFAULT CURRENT_DATE,
  p_at_risk_horizon_days integer DEFAULT 2,
  p_source text DEFAULT 'scheduled'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, get_user_org_id());
  v_run_id uuid;
  v_scanned integer := 0;
  v_opened integer := 0;
  v_updated integer := 0;
  v_resolved integer := 0;
  rec RECORD;
  v_effective_due date;
  v_days_late integer;
  v_days_until integer;
  v_gap_kind text;
  v_severity text;
  v_existing_id uuid;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required for gap detection';
  END IF;

  IF p_source NOT IN ('scheduled', 'manual') THEN
    RAISE EXCEPTION 'Invalid detection source: %', p_source;
  END IF;

  INSERT INTO sampling_gap_detection_runs (organization_id, as_of_date, source, status)
  VALUES (v_org_id, p_as_of, p_source, 'running')
  RETURNING id INTO v_run_id;

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
    'sampling_gap_detection_started',
    'environmental_compliance',
    'sampling_gap_detection_runs',
    v_run_id,
    jsonb_build_object(
      'as_of_date', p_as_of,
      'source', p_source,
      'at_risk_horizon_days', p_at_risk_horizon_days
    ),
    'Calendar gap detection run started'
  );

  PERFORM refresh_sampling_calendar_statuses(v_org_id, p_as_of);

  WITH resolved AS (
    UPDATE sampling_gap_records sgr
    SET review_status = 'resolved',
        resolved_at = now(),
        valid_to = now(),
        updated_at = now(),
        review_notes = COALESCE(review_notes, 'Auto-resolved: lab result or documented field outcome detected')
    WHERE sgr.organization_id = v_org_id
      AND sgr.review_status <> 'resolved'
      AND (
        sampling_calendar_has_lab_result(sgr.calendar_id)
        OR sampling_calendar_is_documented_excuse(sgr.calendar_id)
      )
    RETURNING sgr.work_order_id
  ),
  close_work_orders AS (
    UPDATE work_orders wo
    SET status = 'completed',
        completed_at = now(),
        notes = COALESCE(wo.notes, '') || ' Auto-closed: gap resolved by lab result or documented excuse.'
    FROM resolved r
    WHERE wo.id = r.work_order_id
      AND wo.status IN ('open', 'assigned', 'in_progress')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_resolved FROM resolved;

  FOR rec IN
    SELECT
      sc.id AS calendar_id,
      sc.outfall_id,
      sc.parameter_id,
      sc.scheduled_date,
      COALESCE(sc.window_end, sc.scheduled_date) AS effective_due,
      sc.dispatch_status,
      sc.status AS calendar_status,
      sc.skip_reason,
      fv.outcome AS field_visit_outcome,
      fv.visit_status AS field_visit_status
    FROM sampling_calendar sc
    LEFT JOIN field_visits fv ON fv.id = sc.current_field_visit_id
    WHERE sc.organization_id = v_org_id
      AND NOT sampling_calendar_has_lab_result(sc.id)
      AND NOT sampling_calendar_is_documented_excuse(sc.id)
      AND sc.status NOT IN ('cancelled')
  LOOP
    v_scanned := v_scanned + 1;
    v_effective_due := rec.effective_due;
    v_days_late := GREATEST(0, p_as_of - v_effective_due);
    v_days_until := GREATEST(0, v_effective_due - p_as_of);

    IF v_effective_due < p_as_of THEN
      v_gap_kind := 'missed';
    ELSIF v_effective_due <= p_as_of + p_at_risk_horizon_days THEN
      v_gap_kind := 'at_risk';
    ELSE
      CONTINUE;
    END IF;

    v_severity := sampling_calendar_gap_severity(v_gap_kind, v_days_late, v_days_until);

    SELECT id INTO v_existing_id
    FROM sampling_gap_records
    WHERE calendar_id = rec.calendar_id
      AND review_status <> 'resolved'
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      PERFORM open_sampling_gap_with_work_order(
        v_org_id,
        v_run_id,
        rec.calendar_id,
        v_gap_kind,
        v_severity,
        rec.scheduled_date,
        rec.effective_due,
        v_days_late,
        rec.dispatch_status,
        rec.calendar_status,
        rec.field_visit_outcome,
        rec.field_visit_status,
        rec.skip_reason,
        rec.outfall_id,
        rec.parameter_id
      );
      v_opened := v_opened + 1;
    ELSE
      UPDATE sampling_gap_records
      SET detection_run_id = v_run_id,
          gap_kind = v_gap_kind,
          severity = v_severity,
          days_late = v_days_late,
          dispatch_status = rec.dispatch_status,
          calendar_status = rec.calendar_status,
          field_visit_outcome = rec.field_visit_outcome,
          field_visit_status = rec.field_visit_status,
          skip_reason = rec.skip_reason,
          window_end = rec.effective_due,
          last_detected_at = now(),
          updated_at = now()
      WHERE id = v_existing_id;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  UPDATE sampling_gap_detection_runs
  SET finished_at = now(),
      calendars_scanned = v_scanned,
      gaps_opened = v_opened,
      gaps_updated = v_updated,
      gaps_resolved = v_resolved,
      status = 'completed',
      metadata = jsonb_build_object(
        'at_risk_horizon_days', p_at_risk_horizon_days
      )
  WHERE id = v_run_id;

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
    'sampling_gap_detection_completed',
    'environmental_compliance',
    'sampling_gap_detection_runs',
    v_run_id,
    jsonb_build_object(
      'calendars_scanned', v_scanned,
      'gaps_opened', v_opened,
      'gaps_updated', v_updated,
      'gaps_resolved', v_resolved
    ),
    'Calendar gap detection run completed'
  );

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'organization_id', v_org_id,
    'calendars_scanned', v_scanned,
    'gaps_opened', v_opened,
    'gaps_updated', v_updated,
    'gaps_resolved', v_resolved
  );
EXCEPTION
  WHEN OTHERS THEN
    UPDATE sampling_gap_detection_runs
    SET finished_at = now(),
        status = 'failed',
        error_message = SQLERRM
    WHERE id = v_run_id;

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
      'sampling_gap_detection_failed',
      'environmental_compliance',
      'sampling_gap_detection_runs',
      v_run_id,
      jsonb_build_object('error', SQLERRM),
      'Calendar gap detection run failed'
    );

    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Penalty exposure lines — citation + verification_status per row (§7.2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS penalty_exposure_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  label text NOT NULL,
  amount numeric(14, 2) NOT NULL DEFAULT 0,
  event_count integer NOT NULL DEFAULT 0,
  citation text NOT NULL,
  verification_status text NOT NULL DEFAULT 'draft'
    CHECK (verification_status IN ('draft', 'verified', 'disputed')),
  confidence text NOT NULL DEFAULT 'draft_estimate',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  transaction_time timestamptz NOT NULL DEFAULT now(),
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_key, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_penalty_exposure_lines_org_snapshot
  ON penalty_exposure_lines(organization_id, snapshot_at DESC);

ALTER TABLE penalty_exposure_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY penalty_exposure_lines_select ON penalty_exposure_lines
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY penalty_exposure_lines_service ON penalty_exposure_lines
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION refresh_penalty_exposure_lines(p_organization_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, get_user_org_id());
  v_verification_status text := 'draft';
  v_fts numeric := 0;
  v_fts_events integer := 0;
  v_gap_estimate numeric := 0;
  v_gap_missed integer := 0;
  v_obligations numeric := 0;
  v_obligations_count integer := 0;
  v_violations numeric := 0;
  v_violations_count integer := 0;
  v_snapshot timestamptz := now();
BEGIN
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM penalty_ledger_verifications
    WHERE organization_id = v_org_id AND is_active = true
  ) THEN
    v_verification_status := 'verified';
  END IF;

  SELECT COALESCE(SUM(penalty_amount), 0), COUNT(*)::int
  INTO v_fts, v_fts_events
  FROM fts_violations
  WHERE organization_id = v_org_id;

  SELECT
    COALESCE(SUM(calculate_draft_miss_sampling_penalty(days_late)), 0),
    COUNT(*)::int
  INTO v_gap_estimate, v_gap_missed
  FROM sampling_gap_records
  WHERE organization_id = v_org_id
    AND gap_kind = 'missed'
    AND review_status NOT IN ('resolved', 'force_majeure');

  SELECT COALESCE(SUM(accrued_penalty), 0), COUNT(*)::int
  INTO v_obligations, v_obligations_count
  FROM consent_decree_obligations
  WHERE status IN ('active', 'overdue')
    AND accrued_penalty > 0;

  SELECT
    COALESCE(SUM(COALESCE(actual_penalty, estimated_penalty, 0)), 0),
    COUNT(*)::int
  INTO v_violations, v_violations_count
  FROM compliance_violations
  WHERE organization_id = v_org_id
    AND status NOT IN ('closed', 'resolved');

  UPDATE penalty_exposure_lines
  SET valid_to = v_snapshot,
      updated_at = v_snapshot
  WHERE organization_id = v_org_id
    AND valid_to IS NULL
    AND snapshot_at < v_snapshot;

  INSERT INTO penalty_exposure_lines (
    organization_id, source_key, label, amount, event_count,
    citation, verification_status, confidence, snapshot_at
  ) VALUES
    (
      v_org_id, 'fts_uploaded', 'Failure-to-Sample (uploaded FTS)',
      v_fts, v_fts_events,
      'Consent Decree ¶49 — failure-to-sample reporting (uploaded FTS records)',
      v_verification_status, 'uploaded', v_snapshot
    ),
    (
      v_org_id, 'sampling_gaps', 'Calendar gaps (draft estimate)',
      v_gap_estimate, v_gap_missed,
      'Consent Decree ¶49 Category I/II — draft miss-sampling estimate (internal model)',
      'draft', 'draft_estimate', v_snapshot
    ),
    (
      v_org_id, 'cd_obligations', 'Consent Decree obligations (accrual)',
      v_obligations, v_obligations_count,
      'Case 7:16-cv-00462-GEC — stipulated penalty accrual on active CD obligations',
      v_verification_status, 'calculated', v_snapshot
    ),
    (
      v_org_id, 'compliance_violations', 'Compliance violations (est./actual)',
      v_violations, v_violations_count,
      'Organization compliance_violations — estimated/actual penalty exposure',
      v_verification_status, 'mixed', v_snapshot
    )
  ON CONFLICT (organization_id, source_key, snapshot_at) DO UPDATE
  SET amount = EXCLUDED.amount,
      event_count = EXCLUDED.event_count,
      verification_status = EXCLUDED.verification_status,
      updated_at = v_snapshot;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_penalty_exposure_lines(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. get_penalty_ledger_summary — citation + verification_status from exposure lines
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_penalty_ledger_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := get_user_org_id();
  v_fts numeric := 0;
  v_fts_events integer := 0;
  v_gap_estimate numeric := 0;
  v_gap_missed integer := 0;
  v_obligations numeric := 0;
  v_obligations_count integer := 0;
  v_violations numeric := 0;
  v_violations_count integer := 0;
  v_verification jsonb := '{}'::jsonb;
  v_sources jsonb;
  v_verification_status text := 'draft';
BEGIN
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_org');
  END IF;

  PERFORM refresh_penalty_exposure_lines(v_org_id);

  SELECT COALESCE(SUM(penalty_amount), 0), COUNT(*)::int
  INTO v_fts, v_fts_events
  FROM fts_violations
  WHERE organization_id = v_org_id;

  SELECT
    COALESCE(SUM(calculate_draft_miss_sampling_penalty(days_late)), 0),
    COUNT(*)::int
  INTO v_gap_estimate, v_gap_missed
  FROM sampling_gap_records
  WHERE organization_id = v_org_id
    AND gap_kind = 'missed'
    AND review_status NOT IN ('resolved', 'force_majeure');

  SELECT COALESCE(SUM(accrued_penalty), 0), COUNT(*)::int
  INTO v_obligations, v_obligations_count
  FROM consent_decree_obligations
  WHERE status IN ('active', 'overdue')
    AND accrued_penalty > 0;

  SELECT
    COALESCE(SUM(COALESCE(actual_penalty, estimated_penalty, 0)), 0),
    COUNT(*)::int
  INTO v_violations, v_violations_count
  FROM compliance_violations
  WHERE organization_id = v_org_id
    AND status NOT IN ('closed', 'resolved');

  SELECT jsonb_build_object(
    'id', id,
    'verified_at', verified_at,
    'verified_by', verified_by,
    'note', note,
    'coverage_summary', coverage_summary
  )
  INTO v_verification
  FROM penalty_ledger_verifications
  WHERE organization_id = v_org_id
    AND is_active = true
  ORDER BY verified_at DESC
  LIMIT 1;

  IF v_verification ? 'verified_at' THEN
    v_verification_status := 'verified';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'key', source_key,
        'label', label,
        'amount', amount,
        'event_count', event_count,
        'confidence', confidence,
        'citation', citation,
        'verification_status', verification_status
      )
      ORDER BY source_key
    ),
    '[]'::jsonb
  )
  INTO v_sources
  FROM penalty_exposure_lines
  WHERE organization_id = v_org_id
    AND valid_to IS NULL
    AND snapshot_at = (
      SELECT MAX(snapshot_at)
      FROM penalty_exposure_lines pel2
      WHERE pel2.organization_id = v_org_id
    );

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'computed_at', now(),
    'verification_status', v_verification_status,
    'latest_verification', COALESCE(v_verification, '{}'::jsonb),
    'sources', COALESCE(v_sources, jsonb_build_array(
      jsonb_build_object(
        'key', 'fts_uploaded',
        'label', 'Failure-to-Sample (uploaded FTS)',
        'amount', v_fts,
        'event_count', v_fts_events,
        'confidence', 'uploaded',
        'citation', 'Consent Decree ¶49 — failure-to-sample reporting (uploaded FTS records)',
        'verification_status', v_verification_status
      ),
      jsonb_build_object(
        'key', 'sampling_gaps',
        'label', 'Calendar gaps (draft estimate)',
        'amount', v_gap_estimate,
        'event_count', v_gap_missed,
        'confidence', 'draft_estimate',
        'citation', 'Consent Decree ¶49 Category I/II — draft miss-sampling estimate (internal model)',
        'verification_status', 'draft'
      ),
      jsonb_build_object(
        'key', 'cd_obligations',
        'label', 'Consent Decree obligations (accrual)',
        'amount', v_obligations,
        'event_count', v_obligations_count,
        'confidence', 'calculated',
        'citation', 'Case 7:16-cv-00462-GEC — stipulated penalty accrual on active CD obligations',
        'verification_status', v_verification_status
      ),
      jsonb_build_object(
        'key', 'compliance_violations',
        'label', 'Compliance violations (est./actual)',
        'amount', v_violations,
        'event_count', v_violations_count,
        'confidence', 'mixed',
        'citation', 'Organization compliance_violations — estimated/actual penalty exposure',
        'verification_status', v_verification_status
      )
    )),
    'totals', jsonb_build_object(
      'draft_combined', v_fts + v_gap_estimate + v_obligations + v_violations,
      'uploaded_only', v_fts,
      'estimated_gaps', v_gap_estimate
    ),
    'data_coverage', jsonb_build_object(
      'fts_rows', v_fts_events,
      'open_gaps', v_gap_missed,
      'obligations_with_penalty', v_obligations_count,
      'open_violations', v_violations_count
    ),
    'disclaimer', 'DRAFT — internal estimate, not verified for external or legal use'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Bitemporal columns on edd_paragraph49_evaluations (QW2 statutory alerts)
-- ---------------------------------------------------------------------------
ALTER TABLE edd_paragraph49_evaluations
  ADD COLUMN IF NOT EXISTS valid_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS valid_to timestamptz,
  ADD COLUMN IF NOT EXISTS transaction_time timestamptz NOT NULL DEFAULT now();

COMMENT ON TABLE penalty_exposure_lines IS
  'Keystone §7.2 penalty rows — each line carries citation + verification_status; bitemporal via valid_from/valid_to.';
