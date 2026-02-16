-- =============================================================================
-- Migration 003: RLS policies for corrective_actions
-- =============================================================================
-- Follows established patterns from v3_governance_tables.sql
-- =============================================================================

-- =========================================================================
-- SELECT: Users can view CAs in their organization
-- =========================================================================
CREATE POLICY "Users view own org corrective actions"
  ON corrective_actions FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

-- =========================================================================
-- INSERT: Authorized roles can create CAs
-- Environmental Manager, Admin, Executive can create manually
-- Triggers create via service role
-- =========================================================================
CREATE POLICY "Authorized users create corrective actions"
  ON corrective_actions FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid()
        AND r.name IN ('admin', 'executive', 'environmental_manager', 'site_manager')
    )
  );

-- =========================================================================
-- UPDATE: Assigned user or manager roles can update
-- =========================================================================
CREATE POLICY "Users update assigned or managed corrective actions"
  ON corrective_actions FOR UPDATE TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND (
      -- User is assigned to this CA
      followup_assigned_to = auth.uid()
      -- OR user has manager/admin role
      OR EXISTS (
        SELECT 1 FROM user_role_assignments ura
        JOIN roles r ON r.id = ura.role_id
        WHERE ura.user_id = auth.uid()
          AND r.name IN ('admin', 'executive', 'environmental_manager', 'site_manager')
      )
    )
  )
  WITH CHECK (
    organization_id = get_user_org_id()
  );

-- =========================================================================
-- DELETE: Admin only (soft delete via status preferred)
-- =========================================================================
CREATE POLICY "Admin can delete corrective actions"
  ON corrective_actions FOR DELETE TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid()
        AND r.name = 'admin'
    )
  );

-- =========================================================================
-- SERVICE ROLE: Full access for Edge Functions and triggers
-- =========================================================================
CREATE POLICY "Service role manages all corrective actions"
  ON corrective_actions FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- =========================================================================
-- VERIFICATION
-- =========================================================================
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'corrective_actions';
