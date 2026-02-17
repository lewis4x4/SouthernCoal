-- =============================================================================
-- Migration 006: Fix outfall_aliases constraints and RLS
-- =============================================================================
-- Addresses issues identified in code review:
-- 1. UNIQUE constraint allows NULL duplicates (NULL != NULL in PostgreSQL)
-- 2. Missing ON DELETE CASCADE on organization_id and permit_id FKs
-- 3. RLS policy doesn't validate outfall ownership
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fix 1: Replace UNIQUE constraint with partial indexes for NULL handling
-- ---------------------------------------------------------------------------

-- Drop the existing unique constraint (allows NULL duplicates)
ALTER TABLE outfall_aliases DROP CONSTRAINT IF EXISTS outfall_aliases_unique;

-- Create partial index for permit-scoped aliases (permit_id IS NOT NULL)
CREATE UNIQUE INDEX idx_outfall_aliases_unique_with_permit
  ON outfall_aliases(lower(alias), organization_id, permit_id)
  WHERE permit_id IS NOT NULL;

-- Create partial index for universal aliases (permit_id IS NULL)
-- This ensures only ONE alias per org when permit is not specified
CREATE UNIQUE INDEX idx_outfall_aliases_unique_universal
  ON outfall_aliases(lower(alias), organization_id)
  WHERE permit_id IS NULL;

-- ---------------------------------------------------------------------------
-- Fix 2: Add ON DELETE CASCADE to FK constraints
-- ---------------------------------------------------------------------------

-- Drop and recreate organization_id FK with CASCADE
ALTER TABLE outfall_aliases
  DROP CONSTRAINT IF EXISTS outfall_aliases_organization_id_fkey;

ALTER TABLE outfall_aliases
  ADD CONSTRAINT outfall_aliases_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- Drop and recreate permit_id FK with CASCADE
ALTER TABLE outfall_aliases
  DROP CONSTRAINT IF EXISTS outfall_aliases_permit_id_fkey;

ALTER TABLE outfall_aliases
  ADD CONSTRAINT outfall_aliases_permit_id_fkey
  FOREIGN KEY (permit_id) REFERENCES npdes_permits(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Fix 3: Update RLS INSERT policy to validate outfall ownership
-- ---------------------------------------------------------------------------

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Managers create outfall aliases" ON outfall_aliases;

-- Create improved INSERT policy with outfall ownership validation
CREATE POLICY "Managers create outfall aliases"
  ON outfall_aliases FOR INSERT TO authenticated
  WITH CHECK (
    -- Must be for user's organization
    organization_id = get_user_org_id()
    -- User must have manager role
    AND EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid()
        AND r.name IN ('admin', 'environmental_manager', 'site_manager')
    )
    -- CRITICAL: The outfall must belong to an organization the user can access
    -- This prevents mapping aliases to outfalls from other organizations
    AND EXISTS (
      SELECT 1 FROM outfalls o
      JOIN npdes_permits np ON np.id = o.permit_id
      JOIN sites s ON s.id = np.site_id
      WHERE o.id = outfall_id
        AND s.organization_id = get_user_org_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
COMMENT ON INDEX idx_outfall_aliases_unique_with_permit IS
  'Ensures unique (alias, organization, permit) combinations. Case-insensitive via lower().';

COMMENT ON INDEX idx_outfall_aliases_unique_universal IS
  'Ensures unique (alias, organization) when permit_id is NULL (universal aliases).';
