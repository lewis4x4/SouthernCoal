-- =============================================================================
-- Upload Dashboard RLS Policies — Minimum Viable Set
-- =============================================================================
-- SECURITY GATE: This migration must be reviewed and approved before applying.
-- These are SELECT/INSERT policies only — they do not modify schema.
--
-- Context: The Upload Dashboard needs to:
--   1. Read file_processing_queue entries scoped to user's org
--   2. Subscribe to Realtime changes on file_processing_queue
--   3. Query npdes_permits, outfalls, permit_limits for summary stats
--   4. Read documents for file metadata
--   5. Insert audit_log entries (policy confirmed to already exist)
--
-- All policies scope data to the user's organization via user_profiles.
-- =============================================================================

-- file_processing_queue: SELECT scoped to org
-- Users can only see queue entries uploaded by members of their organization
CREATE POLICY "Users can view own org queue entries"
ON file_processing_queue FOR SELECT
TO authenticated
USING (
  uploaded_by IN (
    SELECT id FROM user_profiles
    WHERE organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

-- file_processing_queue: INSERT for authenticated users
-- Users can only insert entries where they are the uploader
CREATE POLICY "Users can insert queue entries"
ON file_processing_queue FOR INSERT
TO authenticated
WITH CHECK (uploaded_by = auth.uid());

-- npdes_permits: SELECT scoped via site → org chain
-- Users can view permits for sites belonging to their organization
CREATE POLICY "Users can view own org permits"
ON npdes_permits FOR SELECT
TO authenticated
USING (
  site_id IN (
    SELECT id FROM sites
    WHERE organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

-- outfalls: SELECT scoped via site → org chain
-- Same pattern as permits — outfalls belong to sites, sites belong to orgs
CREATE POLICY "Users can view own org outfalls"
ON outfalls FOR SELECT
TO authenticated
USING (
  site_id IN (
    SELECT id FROM sites
    WHERE organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);

-- permit_limits: SELECT scoped via outfall → site → org chain
-- permit_limits references outfalls, which reference sites
CREATE POLICY "Users can view own org permit limits"
ON permit_limits FOR SELECT
TO authenticated
USING (
  outfall_id IN (
    SELECT id FROM outfalls
    WHERE site_id IN (
      SELECT id FROM sites
      WHERE organization_id = (
        SELECT organization_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  )
);

-- documents: SELECT scoped to org
-- Users can view documents belonging to their organization
CREATE POLICY "Users can view own org documents"
ON documents FOR SELECT
TO authenticated
USING (
  organization_id = (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  )
);

-- user_profiles: SELECT for own profile
-- Users need to read their own profile for org scoping and display
CREATE POLICY "Users can view own profile"
ON user_profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

-- organizations: SELECT scoped to user's org
-- Users need to read their org name for header display
CREATE POLICY "Users can view own organization"
ON organizations FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  )
);

-- roles: SELECT for all authenticated
-- Reference table — all users need to resolve role names
CREATE POLICY "Authenticated users can read roles"
ON roles FOR SELECT
TO authenticated
USING (true);

-- user_role_assignments: SELECT for own assignments
-- Users need to read their own role assignments for RBAC
CREATE POLICY "Users can view own role assignments"
ON user_role_assignments FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- NOTE: audit_log INSERT policy for authenticated users is confirmed to already
-- exist per CMS Schema Documentation. No additional policy needed.
