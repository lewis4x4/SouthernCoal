-- Lane C: Draft stipulated-penalty ledger (aggregates FTS, gaps, CD obligations, violations)

-- ---------------------------------------------------------------------------
-- 1. Draft miss-sampling estimate (Consent Decree ¶49 tiers — internal model)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_draft_miss_sampling_penalty(p_days_late integer)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_days_late IS NULL OR p_days_late <= 0 THEN
    RETURN 0;
  END IF;
  -- Category I (1–14 days late): $2,000 per missed sample
  IF p_days_late BETWEEN 1 AND 14 THEN
    RETURN 2000.00;
  END IF;
  -- Category II (15+ days): $3,000 per missed sample
  RETURN 3000.00;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Counsel / executive sign-off (does not certify legal accuracy — audit only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS penalty_ledger_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  verified_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  note text,
  coverage_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_penalty_ledger_verifications_org_active
  ON penalty_ledger_verifications(organization_id, is_active, verified_at DESC);

ALTER TABLE penalty_ledger_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY penalty_ledger_verifications_select ON penalty_ledger_verifications
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY penalty_ledger_verifications_insert ON penalty_ledger_verifications
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY[
      'admin', 'executive', 'coo', 'chief_counsel'
    ])
  );

CREATE POLICY penalty_ledger_verifications_service ON penalty_ledger_verifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. Aggregated ledger summary RPC
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
BEGIN
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_org');
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

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'computed_at', now(),
    'verification_status', CASE
      WHEN v_verification ? 'verified_at' THEN 'verified'
      ELSE 'draft'
    END,
    'latest_verification', COALESCE(v_verification, '{}'::jsonb),
    'sources', jsonb_build_array(
      jsonb_build_object(
        'key', 'fts_uploaded',
        'label', 'Failure-to-Sample (uploaded FTS)',
        'amount', v_fts,
        'event_count', v_fts_events,
        'confidence', 'uploaded'
      ),
      jsonb_build_object(
        'key', 'sampling_gaps',
        'label', 'Calendar gaps (draft estimate)',
        'amount', v_gap_estimate,
        'event_count', v_gap_missed,
        'confidence', 'draft_estimate'
      ),
      jsonb_build_object(
        'key', 'cd_obligations',
        'label', 'Consent Decree obligations (accrual)',
        'amount', v_obligations,
        'event_count', v_obligations_count,
        'confidence', 'calculated'
      ),
      jsonb_build_object(
        'key', 'compliance_violations',
        'label', 'Compliance violations (est./actual)',
        'amount', v_violations,
        'event_count', v_violations_count,
        'confidence', 'mixed'
      )
    ),
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

GRANT EXECUTE ON FUNCTION get_penalty_ledger_summary() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Sign-off RPC (audit-logged; prior active row deactivated)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_penalty_ledger_verification(p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := get_user_org_id();
  v_user_id uuid := auth.uid();
  v_summary jsonb;
  v_row penalty_ledger_verifications%ROWTYPE;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF NOT current_user_has_any_role(ARRAY['admin', 'executive', 'coo', 'chief_counsel']) THEN
    RAISE EXCEPTION 'Insufficient role for penalty ledger sign-off';
  END IF;

  v_summary := get_penalty_ledger_summary();

  UPDATE penalty_ledger_verifications
  SET is_active = false
  WHERE organization_id = v_org_id
    AND is_active = true;

  INSERT INTO penalty_ledger_verifications (
    organization_id,
    verified_by,
    note,
    coverage_summary
  )
  VALUES (
    v_org_id,
    v_user_id,
    p_note,
    v_summary
  )
  RETURNING * INTO v_row;

  INSERT INTO audit_log (
    user_id,
    organization_id,
    action,
    module,
    table_name,
    record_id,
    description
  )
  VALUES (
    v_user_id,
    v_org_id,
    'penalty_ledger_verified',
    'compliance',
    'penalty_ledger_verifications',
    v_row.id,
    jsonb_build_object(
      'note', p_note,
      'draft_combined', v_summary->'totals'->'draft_combined',
      'coverage', v_summary->'data_coverage'
    )::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'verification_id', v_row.id,
    'verified_at', v_row.verified_at,
    'summary', v_summary
  );
END;
$$;

GRANT EXECUTE ON FUNCTION record_penalty_ledger_verification(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Daily refresh of CD obligation generated penalty columns
-- ---------------------------------------------------------------------------
SELECT cron.unschedule('refresh-obligation-penalties-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-obligation-penalties-daily');

SELECT cron.schedule(
  'refresh-obligation-penalties-daily',
  '15 6 * * *',
  $$
  UPDATE consent_decree_obligations
  SET updated_at = now()
  WHERE completion_date IS NULL
    AND status IN ('active', 'overdue');
  $$
);
