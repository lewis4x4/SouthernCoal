-- =============================================================================
-- Migration 001: Create get_user_org_id() helper function
-- =============================================================================
-- CRITICAL: This function is referenced by 20+ RLS policies but was never defined.
-- Must exist before any org-scoped RLS policies can work correctly.
-- =============================================================================

-- Create the function with SECURITY DEFINER to allow reading user_profiles
-- even when the caller's RLS context isn't fully resolved yet.
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM user_profiles
  WHERE id = auth.uid()
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_org_id() TO authenticated;

-- Documentation
COMMENT ON FUNCTION get_user_org_id() IS
  'Returns the organization_id for the current authenticated user. Used by RLS policies for org-scoped access control.';

-- =============================================================================
-- VERIFICATION: Run after applying to confirm function exists
-- =============================================================================
-- SELECT proname, prosrc FROM pg_proc WHERE proname = 'get_user_org_id';
-- SELECT get_user_org_id(); -- Should return current user's org_id
