-- Lane C: MSHA sync pipeline — fix unique key, abatement columns, at-risk RPC, weekly cron

ALTER TABLE external_msha_inspections
  ADD COLUMN IF NOT EXISTS violation_issue_date date,
  ADD COLUMN IF NOT EXISTS abatement_due_date date,
  ADD COLUMN IF NOT EXISTS termination_date date,
  ADD COLUMN IF NOT EXISTS inspection_end_date date,
  ADD COLUMN IF NOT EXISTS contested boolean NOT NULL DEFAULT false;

ALTER TABLE external_msha_inspections
  DROP CONSTRAINT IF EXISTS external_msha_inspections_organization_id_mine_id_event_num_key;

ALTER TABLE external_msha_inspections
  DROP CONSTRAINT IF EXISTS external_msha_inspections_org_mine_violation_key;

ALTER TABLE external_msha_inspections
  ADD CONSTRAINT external_msha_inspections_org_mine_violation_key
  UNIQUE (organization_id, mine_id, violation_number);

CREATE INDEX IF NOT EXISTS idx_emi_abatement_due
  ON external_msha_inspections(organization_id, abatement_due_date)
  WHERE termination_date IS NULL AND abatement_due_date IS NOT NULL;

CREATE OR REPLACE FUNCTION get_msha_abatement_at_risk(
  p_org_id uuid DEFAULT NULL,
  p_days_ahead integer DEFAULT 14
)
RETURNS TABLE (
  id uuid,
  mine_id text,
  violation_number text,
  event_number text,
  inspection_date date,
  abatement_due_date date,
  days_until_due integer,
  significant_substantial boolean,
  proposed_penalty numeric,
  current_status text,
  urgency text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    emi.id,
    emi.mine_id,
    emi.violation_number,
    emi.event_number,
    emi.inspection_date,
    emi.abatement_due_date,
    (emi.abatement_due_date - CURRENT_DATE)::integer AS days_until_due,
    emi.significant_substantial,
    emi.proposed_penalty,
    emi.current_status,
    CASE
      WHEN emi.abatement_due_date < CURRENT_DATE THEN 'overdue'
      WHEN emi.abatement_due_date <= CURRENT_DATE + p_days_ahead THEN 'due_soon'
      ELSE 'ok'
    END AS urgency
  FROM external_msha_inspections emi
  WHERE emi.organization_id = COALESCE(p_org_id, get_user_org_id())
    AND emi.abatement_due_date IS NOT NULL
    AND emi.termination_date IS NULL
    AND (
      emi.abatement_due_date < CURRENT_DATE
      OR emi.abatement_due_date <= CURRENT_DATE + p_days_ahead
    )
  ORDER BY emi.abatement_due_date ASC;
$$;

COMMENT ON FUNCTION get_msha_abatement_at_risk IS
  'Open MSHA citations with abatement due overdue or within p_days_ahead (DRAFT operational aid — verify with counsel).';

GRANT EXECUTE ON FUNCTION get_msha_abatement_at_risk(uuid, integer) TO authenticated;

SELECT cron.unschedule('sync-msha-weekly')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-msha-weekly'
);

SELECT cron.schedule(
  'sync-msha-weekly',
  '0 5 * * 6',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-msha-data',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'sync_type', 'scheduled',
      'lookback_years', 5,
      'run_tag', 'cron-weekly-msha'
    )
  );
  $$
);
