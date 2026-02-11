-- Migration 018: Add organization_id to audit_log for tenant-scoped audit trail
-- Required for RLS scoping — without this, all authenticated users can read all audit entries

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

CREATE INDEX IF NOT EXISTS idx_audit_log_org ON audit_log(organization_id);

-- RLS: users see own org's audit entries (NULL org_id entries visible to all authenticated)
CREATE POLICY "Users can view own org audit logs"
  ON audit_log FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id() OR organization_id IS NULL);

-- Service role can manage all
CREATE POLICY "Service role can manage audit logs"
  ON audit_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);
