-- K3: Extend obligation ledger beyond NPDES water — SMCRA + MSHA clocks (draft-labeled).

CREATE TABLE IF NOT EXISTS statutory_obligation_clocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain text NOT NULL CHECK (domain IN ('npdes', 'smcra', 'msha')),
  clock_key text NOT NULL,
  label text NOT NULL,
  due_date date,
  window_end date,
  obligation_status text NOT NULL DEFAULT 'upcoming'
    CHECK (obligation_status IN ('fulfilled', 'excused', 'missed', 'at_risk', 'upcoming')),
  severity text NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  source_table text,
  source_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  transaction_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_statutory_obligation_clocks_org_domain
  ON statutory_obligation_clocks(organization_id, domain, obligation_status)
  WHERE valid_to IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_statutory_obligation_clocks_active
  ON statutory_obligation_clocks(organization_id, domain, clock_key)
  WHERE valid_to IS NULL;

ALTER TABLE statutory_obligation_clocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS statutory_obligation_clocks_select ON statutory_obligation_clocks;
CREATE POLICY statutory_obligation_clocks_select ON statutory_obligation_clocks
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS statutory_obligation_clocks_service ON statutory_obligation_clocks;
CREATE POLICY statutory_obligation_clocks_service ON statutory_obligation_clocks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Refresh SMCRA + MSHA clocks from external data (idempotent upsert)
CREATE OR REPLACE FUNCTION refresh_statutory_obligation_clocks(p_organization_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, get_user_org_id());
  v_count integer := 0;
  rec RECORD;
  v_status text;
  v_severity text;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  -- Close stale MSHA clocks no longer at risk
  UPDATE statutory_obligation_clocks
  SET valid_to = now(), updated_at = now()
  WHERE organization_id = v_org_id
    AND domain = 'msha'
    AND valid_to IS NULL
    AND source_id NOT IN (
      SELECT id FROM get_msha_abatement_at_risk(v_org_id, 30)
    );

  FOR rec IN SELECT * FROM get_msha_abatement_at_risk(v_org_id, 30) LOOP
    v_status := CASE rec.urgency
      WHEN 'overdue' THEN 'missed'
      WHEN 'due_soon' THEN 'at_risk'
      ELSE 'upcoming'
    END;
    v_severity := CASE
      WHEN rec.urgency = 'overdue' AND rec.significant_substantial THEN 'critical'
      WHEN rec.urgency = 'overdue' THEN 'high'
      WHEN rec.significant_substantial THEN 'high'
      ELSE 'medium'
    END;

    INSERT INTO statutory_obligation_clocks (
      organization_id, domain, clock_key, label,
      due_date, obligation_status, severity,
      source_table, source_id, metadata
    ) VALUES (
      v_org_id,
      'msha',
      format('msha_abatement:%s:%s', rec.mine_id, rec.violation_number),
      format('MSHA abatement — mine %s citation %s', rec.mine_id, rec.violation_number),
      rec.abatement_due_date,
      v_status,
      v_severity,
      'external_msha_inspections',
      rec.id,
      jsonb_build_object(
        'mine_id', rec.mine_id,
        'violation_number', rec.violation_number,
        'days_until_due', rec.days_until_due,
        'significant_substantial', rec.significant_substantial
      )
    )
    ON CONFLICT (organization_id, domain, clock_key) WHERE valid_to IS NULL
    DO UPDATE SET
      due_date = EXCLUDED.due_date,
      obligation_status = EXCLUDED.obligation_status,
      severity = EXCLUDED.severity,
      metadata = EXCLUDED.metadata,
      transaction_time = now(),
      updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  -- SMCRA placeholder clocks from permit metadata (draft — expands when SMCRA module ships)
  INSERT INTO statutory_obligation_clocks (
    organization_id, domain, clock_key, label,
    due_date, obligation_status, severity, metadata
  )
  SELECT
    v_org_id,
    'smcra',
    format('smcra_permit:%s', np.id),
    format('SMCRA permit renewal review — %s', np.permit_number),
    (np.expiration_date - interval '90 days')::date,
    CASE
      WHEN np.expiration_date IS NULL THEN 'upcoming'
      WHEN np.expiration_date < CURRENT_DATE THEN 'missed'
      WHEN np.expiration_date <= CURRENT_DATE + 90 THEN 'at_risk'
      ELSE 'upcoming'
    END,
    CASE
      WHEN np.expiration_date IS NOT NULL AND np.expiration_date < CURRENT_DATE THEN 'high'
      WHEN np.expiration_date IS NOT NULL AND np.expiration_date <= CURRENT_DATE + 90 THEN 'medium'
      ELSE 'low'
    END,
    jsonb_build_object('permit_id', np.id, 'permit_number', np.permit_number, 'draft', true)
  FROM npdes_permits np
  WHERE np.organization_id = v_org_id
    AND np.metadata ? 'smcra_permit_number'
  ON CONFLICT (organization_id, domain, clock_key) WHERE valid_to IS NULL
  DO UPDATE SET
    due_date = EXCLUDED.due_date,
    obligation_status = EXCLUDED.obligation_status,
    severity = EXCLUDED.severity,
    metadata = EXCLUDED.metadata,
    updated_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  -- v_count already includes MSHA rows; SMCRA upserts add via separate count if needed

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_statutory_obligation_clocks(uuid) TO authenticated, service_role;

-- Unified obligation ledger RPC (NPDES + SMCRA + MSHA)
CREATE OR REPLACE FUNCTION get_statutory_obligation_ledger(
  p_organization_id uuid DEFAULT NULL,
  p_domain_filter text DEFAULT NULL,
  p_status_filter text DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, get_user_org_id());
  v_npdes jsonb;
  v_cross_domain jsonb;
  v_rows jsonb;
BEGIN
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Organization context required');
  END IF;

  v_npdes := get_sampling_obligation_ledger(v_org_id, p_status_filter, p_limit);

  SELECT COALESCE(jsonb_agg(row_to_json(c)::jsonb ORDER BY c.due_date NULLS LAST), '[]'::jsonb)
  INTO v_cross_domain
  FROM (
    SELECT
      id,
      domain,
      clock_key,
      label,
      due_date,
      window_end,
      obligation_status,
      severity,
      metadata,
      source_table,
      source_id
    FROM statutory_obligation_clocks
    WHERE organization_id = v_org_id
      AND valid_to IS NULL
      AND (p_domain_filter IS NULL OR domain = p_domain_filter)
      AND (p_status_filter IS NULL OR obligation_status = p_status_filter)
    ORDER BY due_date NULLS LAST
    LIMIT GREATEST(1, LEAST(p_limit, 2000))
  ) c;

  v_rows := COALESCE(v_npdes->'rows', '[]'::jsonb) || v_cross_domain;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'computed_at', now(),
    'disclaimer',
      'DRAFT — NPDES calendar partial until Upload Dashboard populates schedules; SMCRA/MSHA clocks advisory',
    'npdes', v_npdes,
    'cross_domain_rows', v_cross_domain,
    'rows', v_rows,
    'domain_filter', p_domain_filter,
    'status_filter', p_status_filter
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_statutory_obligation_ledger(uuid, text, text, integer) TO authenticated;

COMMENT ON FUNCTION get_statutory_obligation_ledger IS
  'Keystone §7.2 unified obligation ledger — NPDES sampling + SMCRA + MSHA clocks (draft-labeled).';
