-- =============================================================================
-- Post-Build Audit Fixes
-- =============================================================================
-- P0: Exceedances INSERT policy allows cross-org injection
-- P1: Missing DELETE/UPDATE policies on sampling_events, lab_results,
--     dmr_submissions, data_corrections, discrepancy_reviews
-- P1: Missing user_profiles.organization_id index for RLS perf
-- P1: Fix search_path on increment_template_run_count
-- =============================================================================

-- =============================================================================
-- P0: Fix overly permissive INSERT policy on exceedances
-- Old: WITH CHECK (organization_id = get_user_org_id() OR organization_id IS NOT NULL)
-- allows ANY authenticated user to insert into ANY org. Fix: own org only.
-- =============================================================================
DROP POLICY IF EXISTS "System can insert exceedances" ON exceedances;
CREATE POLICY "System can insert exceedances"
  ON exceedances FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

-- =============================================================================
-- P1: Add DELETE policy on exceedances
-- =============================================================================
DROP POLICY IF EXISTS "Managers can delete exceedances" ON exceedances;
CREATE POLICY "Managers can delete exceedances"
  ON exceedances FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id());

-- =============================================================================
-- P1: Add missing UPDATE/DELETE policies on sampling_events
-- Uses site_id -> sites.organization_id chain (matches existing SELECT policy)
-- =============================================================================
DROP POLICY IF EXISTS "Users can update own org sampling_events" ON sampling_events;
CREATE POLICY "Users can update own org sampling_events"
  ON sampling_events FOR UPDATE TO authenticated
  USING (
    site_id IN (
      SELECT s.id FROM sites s
      WHERE s.organization_id = get_user_org_id()
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = get_user_org_id())
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = (SELECT parent_id FROM organizations WHERE id = get_user_org_id()))
    )
  )
  WITH CHECK (
    site_id IN (
      SELECT s.id FROM sites s
      WHERE s.organization_id = get_user_org_id()
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = get_user_org_id())
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = (SELECT parent_id FROM organizations WHERE id = get_user_org_id()))
    )
  );

DROP POLICY IF EXISTS "Users can delete own org sampling_events" ON sampling_events;
CREATE POLICY "Users can delete own org sampling_events"
  ON sampling_events FOR DELETE TO authenticated
  USING (
    site_id IN (
      SELECT s.id FROM sites s
      WHERE s.organization_id = get_user_org_id()
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = get_user_org_id())
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = (SELECT parent_id FROM organizations WHERE id = get_user_org_id()))
    )
  );

-- =============================================================================
-- P1: Add missing UPDATE/DELETE policies on lab_results
-- Uses sampling_event_id -> sampling_events -> sites -> org chain
-- =============================================================================
DROP POLICY IF EXISTS "Users can update own org lab_results" ON lab_results;
CREATE POLICY "Users can update own org lab_results"
  ON lab_results FOR UPDATE TO authenticated
  USING (
    sampling_event_id IN (
      SELECT se.id FROM sampling_events se
      JOIN sites s ON s.id = se.site_id
      WHERE s.organization_id = get_user_org_id()
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = get_user_org_id())
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = (SELECT parent_id FROM organizations WHERE id = get_user_org_id()))
    )
  )
  WITH CHECK (
    sampling_event_id IN (
      SELECT se.id FROM sampling_events se
      JOIN sites s ON s.id = se.site_id
      WHERE s.organization_id = get_user_org_id()
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = get_user_org_id())
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = (SELECT parent_id FROM organizations WHERE id = get_user_org_id()))
    )
  );

DROP POLICY IF EXISTS "Users can delete own org lab_results" ON lab_results;
CREATE POLICY "Users can delete own org lab_results"
  ON lab_results FOR DELETE TO authenticated
  USING (
    sampling_event_id IN (
      SELECT se.id FROM sampling_events se
      JOIN sites s ON s.id = se.site_id
      WHERE s.organization_id = get_user_org_id()
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = get_user_org_id())
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = (SELECT parent_id FROM organizations WHERE id = get_user_org_id()))
    )
  );

-- =============================================================================
-- P1: Add missing DELETE policy on dmr_submissions
-- Uses permit_id -> npdes_permits.organization_id chain
-- =============================================================================
DROP POLICY IF EXISTS "Users can delete own org dmr_submissions" ON dmr_submissions;
CREATE POLICY "Users can delete own org dmr_submissions"
  ON dmr_submissions FOR DELETE TO authenticated
  USING (
    permit_id IN (
      SELECT np.id FROM npdes_permits np
      WHERE np.organization_id = get_user_org_id()
         OR np.organization_id IN (SELECT id FROM organizations WHERE parent_id = get_user_org_id())
         OR np.organization_id IN (SELECT id FROM organizations WHERE parent_id = (SELECT parent_id FROM organizations WHERE id = get_user_org_id()))
    )
  );

-- =============================================================================
-- P1: Add missing DELETE policy on data_corrections
-- =============================================================================
DROP POLICY IF EXISTS "Users can delete own org data_corrections" ON data_corrections;
CREATE POLICY "Users can delete own org data_corrections"
  ON data_corrections FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id());

-- =============================================================================
-- P1: Add missing INSERT/DELETE policies on discrepancy_reviews
-- =============================================================================
DROP POLICY IF EXISTS "Users can insert own org discrepancy_reviews" ON discrepancy_reviews;
CREATE POLICY "Users can insert own org discrepancy_reviews"
  ON discrepancy_reviews FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can delete own org discrepancy_reviews" ON discrepancy_reviews;
CREATE POLICY "Users can delete own org discrepancy_reviews"
  ON discrepancy_reviews FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id());

-- =============================================================================
-- P1: Performance index on user_profiles.organization_id
-- Queried on every RLS check via get_user_org_id()
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_user_profiles_org_id
ON user_profiles(organization_id);

-- =============================================================================
-- P1: Index on exceedances.acknowledged_at for acknowledged queries
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_exceedances_acknowledged
ON exceedances(organization_id, acknowledged_at)
WHERE acknowledged_at IS NOT NULL;

-- =============================================================================
-- P1: Fix search_path on increment_template_run_count (security advisory)
-- =============================================================================
CREATE OR REPLACE FUNCTION increment_template_run_count(template_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE report_templates
  SET run_count = run_count + 1, last_run_at = now(), updated_at = now()
  WHERE id = template_id;
END;
$$;
