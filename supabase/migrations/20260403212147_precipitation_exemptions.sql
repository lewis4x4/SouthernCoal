-- ============================================================================
-- R7: Precipitation Exemptions
-- Supports 10-year recurrence interval exemption claims per Consent Decree
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Table: precipitation_exemptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS precipitation_exemptions (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  precipitation_event_id     uuid NOT NULL REFERENCES precipitation_events(id) ON DELETE CASCADE,
  organization_id            uuid REFERENCES organizations(id),
  recurrence_interval        numeric(6,2) NOT NULL,
  justification              text NOT NULL,

  -- Claim
  claimed_by                 uuid REFERENCES user_profiles(id),
  claimed_at                 timestamptz DEFAULT now(),

  -- Approval
  approved_by                uuid REFERENCES user_profiles(id),
  approved_at                timestamptz,
  status                     text NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'denied')),
  denial_reason              text,

  -- 48-hour sampling proof
  forty_eight_hr_sample_proof uuid[] DEFAULT '{}',

  -- Timestamps
  created_at                 timestamptz DEFAULT now(),
  updated_at                 timestamptz DEFAULT now(),

  -- CONSTRAINT: Claimant cannot approve their own exemption
  CONSTRAINT chk_claimed_ne_approved CHECK (claimed_by IS DISTINCT FROM approved_by),

  -- CONSTRAINT: Justification must be >= 50 characters
  CONSTRAINT chk_exemption_justification_length CHECK (char_length(justification) >= 50),

  -- CONSTRAINT: Recurrence interval must be >= 10 years (per Consent Decree)
  CONSTRAINT chk_recurrence_interval_min CHECK (recurrence_interval >= 10)
);

-- Comment
COMMENT ON TABLE precipitation_exemptions IS 'Exemption claims for high-recurrence-interval storm events (>= 10-year storms). Requires separate approver from claimant per Consent Decree obligations.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_precip_exemptions_event_id
  ON precipitation_exemptions(precipitation_event_id);

CREATE INDEX IF NOT EXISTS idx_precip_exemptions_org_status
  ON precipitation_exemptions(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_precip_exemptions_claimed_by
  ON precipitation_exemptions(claimed_by);

-- ---------------------------------------------------------------------------
-- Updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER set_updated_at_precipitation_exemptions
  BEFORE UPDATE ON precipitation_exemptions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE precipitation_exemptions ENABLE ROW LEVEL SECURITY;

-- SELECT: org-scoped for all authenticated users
CREATE POLICY "precipitation_exemptions_select"
  ON precipitation_exemptions FOR SELECT TO authenticated
  USING (
    organization_id = get_user_org_id()
    OR organization_id IS NULL
  );

-- INSERT: claim roles (env_manager, site_manager, admin)
CREATE POLICY "precipitation_exemptions_insert"
  ON precipitation_exemptions FOR INSERT TO authenticated
  WITH CHECK (
    current_user_has_any_role(ARRAY['environmental_manager', 'site_manager', 'admin'])
    AND (organization_id = get_user_org_id() OR organization_id IS NULL)
  );

-- UPDATE: approve/deny roles (executive, env_manager, admin)
CREATE POLICY "precipitation_exemptions_update"
  ON precipitation_exemptions FOR UPDATE TO authenticated
  USING (
    current_user_has_any_role(ARRAY['executive', 'environmental_manager', 'admin'])
    AND (organization_id = get_user_org_id() OR organization_id IS NULL)
  )
  WITH CHECK (
    current_user_has_any_role(ARRAY['executive', 'environmental_manager', 'admin'])
    AND (organization_id = get_user_org_id() OR organization_id IS NULL)
  );

-- DELETE: admin only
CREATE POLICY "precipitation_exemptions_delete"
  ON precipitation_exemptions FOR DELETE TO authenticated
  USING (
    current_user_has_any_role(ARRAY['admin'])
    AND (organization_id = get_user_org_id() OR organization_id IS NULL)
  );

-- ---------------------------------------------------------------------------
-- Audit immutability trigger: prevent deletion of exemption audit records
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_exemption_audit_delete()
RETURNS trigger AS $$
BEGIN
  IF OLD.action IN ('precipitation_exemption_claimed', 'precipitation_exemption_approved', 'precipitation_exemption_denied') THEN
    RAISE EXCEPTION 'Cannot delete exemption audit records — immutable for compliance';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if audit_log table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'audit_log' AND schemaname = 'public') THEN
    -- Check if trigger already exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_exemption_audit_delete_trigger'
    ) THEN
      CREATE TRIGGER prevent_exemption_audit_delete_trigger
        BEFORE DELETE ON audit_log
        FOR EACH ROW
        EXECUTE FUNCTION prevent_exemption_audit_delete();
    END IF;
  END IF;
END
$$;;
