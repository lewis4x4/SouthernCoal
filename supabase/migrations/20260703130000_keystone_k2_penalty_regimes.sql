-- K2: Penalty keystone substrate — bitemporal penalty_regimes + penalty_curves.
-- Seeded EMPTY/not-configured (verified CD appendix compilation is human-gated §3.17).
-- Gates record_penalty_ledger_verification() until verified regime rows exist.

CREATE TABLE IF NOT EXISTS penalty_regimes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  regime_key text NOT NULL,
  label text NOT NULL,
  citation text NOT NULL,
  verification_status text NOT NULL DEFAULT 'not_configured'
    CHECK (verification_status IN ('not_configured', 'draft', 'verified', 'disputed')),
  notes text,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  transaction_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_penalty_regimes_active_key
  ON penalty_regimes(COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), regime_key)
  WHERE valid_to IS NULL;

CREATE TABLE IF NOT EXISTS penalty_curves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regime_id uuid NOT NULL REFERENCES penalty_regimes(id) ON DELETE CASCADE,
  tier_order integer NOT NULL DEFAULT 1,
  tier_label text NOT NULL,
  rate_per_day numeric(14, 4),
  rate_per_event numeric(14, 4),
  cap_amount numeric(14, 2),
  citation text NOT NULL,
  verification_status text NOT NULL DEFAULT 'not_configured'
    CHECK (verification_status IN ('not_configured', 'draft', 'verified', 'disputed')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  transaction_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_penalty_curves_regime
  ON penalty_curves(regime_id)
  WHERE valid_to IS NULL;

ALTER TABLE penalty_regimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalty_curves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS penalty_regimes_select ON penalty_regimes;
CREATE POLICY penalty_regimes_select ON penalty_regimes
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR organization_id = get_user_org_id());

DROP POLICY IF EXISTS penalty_regimes_service ON penalty_regimes;
CREATE POLICY penalty_regimes_service ON penalty_regimes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS penalty_curves_select ON penalty_curves;
CREATE POLICY penalty_curves_select ON penalty_curves
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM penalty_regimes pr
      WHERE pr.id = regime_id
        AND (pr.organization_id IS NULL OR pr.organization_id = get_user_org_id())
    )
  );

DROP POLICY IF EXISTS penalty_curves_service ON penalty_curves;
CREATE POLICY penalty_curves_service ON penalty_curves
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Global EMPTY / not-configured seed (no dollar amounts — human gate §3.17)
INSERT INTO penalty_regimes (
  organization_id, regime_key, label, citation, verification_status, notes
)
SELECT NULL, 'consent_decree_stipulated',
  'Consent Decree Stipulated Penalties (NOT CONFIGURED)',
  'Consent Decree Appendix — penalty schedule pending counsel verification',
  'not_configured',
  'EMPTY seed — compile verified penalty appendix before flipping to verified'
WHERE NOT EXISTS (
  SELECT 1 FROM penalty_regimes WHERE regime_key = 'consent_decree_stipulated' AND valid_to IS NULL
);

INSERT INTO penalty_regimes (
  organization_id, regime_key, label, citation, verification_status, notes
)
SELECT NULL, 'npdes_fts',
  'NPDES Failure-to-Sample (NOT CONFIGURED)',
  'Consent Decree ¶49 — FTS penalty rates pending verification',
  'not_configured',
  'EMPTY seed — DRAFT estimates only until regime verified'
WHERE NOT EXISTS (
  SELECT 1 FROM penalty_regimes WHERE regime_key = 'npdes_fts' AND valid_to IS NULL
);

INSERT INTO penalty_regimes (
  organization_id, regime_key, label, citation, verification_status, notes
)
SELECT NULL, 'msha_civil_penalty',
  'MSHA Civil Penalty (NOT CONFIGURED)',
  '30 CFR Part 100 — MSHA penalty schedule pending verification',
  'not_configured',
  'EMPTY seed — operational aid only'
WHERE NOT EXISTS (
  SELECT 1 FROM penalty_regimes WHERE regime_key = 'msha_civil_penalty' AND valid_to IS NULL
);

-- Helper: org has verified penalty regime substrate
CREATE OR REPLACE FUNCTION org_has_verified_penalty_regimes(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM penalty_regimes pr
    WHERE pr.valid_to IS NULL
      AND pr.verification_status = 'verified'
      AND (pr.organization_id IS NULL OR pr.organization_id = p_org_id)
  );
$$;

GRANT EXECUTE ON FUNCTION org_has_verified_penalty_regimes(uuid) TO authenticated, service_role;

-- Gate sign-off: require verified regimes + block DRAFT→VERIFIED flip without §3.17
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

  IF NOT org_has_verified_penalty_regimes(v_org_id) THEN
    RAISE EXCEPTION
      'Penalty ledger sign-off blocked: no verified penalty_regimes rows. '
      'Compile CD appendix penalty schedule (task 3.17) and seed verified regimes first.';
  END IF;

  v_summary := get_penalty_ledger_summary();

  UPDATE penalty_ledger_verifications
  SET is_active = false,
      valid_to = COALESCE(valid_to, now()),
      transaction_time = now()
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
      'coverage', v_summary->'data_coverage',
      'regime_gate', 'verified_regimes_present'
    )::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'verification_id', v_row.id,
    'verified_at', v_row.verified_at,
    'summary', v_summary,
    'disclaimer', 'Internal coverage review only — not legal certification or external penalty sign-off'
  );
END;
$$;

-- Keep penalty_exposure_lines DRAFT until verified regimes (override prior auto-verify)
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

  -- Only flip to verified when BOTH ledger sign-off AND verified penalty_regimes exist
  IF org_has_verified_penalty_regimes(v_org_id)
     AND EXISTS (
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
      v_org_id, 'sampling_gap_draft', 'Missed Sampling (draft estimate)',
      v_gap_estimate, v_gap_missed,
      'Consent Decree ¶49 — draft miss-sampling estimate (NOT verified dollars)',
      'draft', 'draft_estimate', v_snapshot
    ),
    (
      v_org_id, 'cd_obligations', 'Consent Decree Obligations (accrued)',
      v_obligations, v_obligations_count,
      'Consent Decree obligations table — accrued_penalty column',
      v_verification_status, 'seeded', v_snapshot
    ),
    (
      v_org_id, 'compliance_violations', 'Compliance Violations (estimated)',
      v_violations, v_violations_count,
      'Internal compliance_violations — estimated/actual penalty fields',
      'draft', 'draft_estimate', v_snapshot
    )
  ON CONFLICT (organization_id, source_key, snapshot_at) DO UPDATE SET
    amount = EXCLUDED.amount,
    event_count = EXCLUDED.event_count,
    verification_status = EXCLUDED.verification_status,
    updated_at = v_snapshot;
END;
$$;

COMMENT ON TABLE penalty_regimes IS
  'Keystone §7.2 penalty regime substrate — citation + verification_status; EMPTY until task 3.17 sign-off.';
COMMENT ON TABLE penalty_curves IS
  'Keystone §7.2 tiered penalty curves linked to penalty_regimes — bitemporal.';
