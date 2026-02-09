-- =============================================================================
-- file_processing_queue: UPDATE policy for metadata corrections
-- =============================================================================
-- Users can update queue entries belonging to their organization.
-- This enables inline editing of state_code, file_category, etc.
-- Scoped to org via the same uploaded_by → user_profiles chain as SELECT.
-- =============================================================================

CREATE POLICY "Users can update own org queue entries"
ON file_processing_queue FOR UPDATE
TO authenticated
USING (
  uploaded_by IN (
    SELECT id FROM user_profiles
    WHERE organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  )
)
WITH CHECK (
  uploaded_by IN (
    SELECT id FROM user_profiles
    WHERE organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  )
);
