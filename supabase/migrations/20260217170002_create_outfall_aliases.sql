-- =============================================================================
-- Migration 002: Create outfall_aliases table
-- =============================================================================
-- Maps lab file outfall identifiers to canonical outfalls.id
-- Persists fuzzy match learnings from parse-lab-data-edd
-- Scoped per organization + permit to handle overlapping outfall numbering
-- =============================================================================

CREATE TABLE outfall_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The canonical outfall this alias maps to
  outfall_id uuid NOT NULL REFERENCES outfalls(id) ON DELETE CASCADE,

  -- The alias string (as it appears in source files)
  alias text NOT NULL,

  -- Source context
  source text CHECK (source IN ('lab_edd', 'permit_sheet', 'dmr', 'netdmr', 'osmre', 'manual')),

  -- Match method that created this alias (for debugging/audit)
  match_method text CHECK (match_method IN ('exact', 'zero_strip', 'digits_only', 'user_confirmed')),

  -- Organization scoping (different orgs may have overlapping outfall IDs)
  organization_id uuid NOT NULL REFERENCES organizations(id),

  -- Permit scoping (outfall "001" means different things per permit)
  permit_id uuid REFERENCES npdes_permits(id),

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Unique per org/permit context
  CONSTRAINT outfall_aliases_unique UNIQUE (alias, organization_id, permit_id)
);

-- Index for fast lookup during parsing
CREATE INDEX idx_outfall_aliases_lookup
  ON outfall_aliases(organization_id, permit_id, lower(alias));

-- Index for outfall_id lookups
CREATE INDEX idx_outfall_aliases_outfall_id
  ON outfall_aliases(outfall_id);

-- Enable RLS
ALTER TABLE outfall_aliases ENABLE ROW LEVEL SECURITY;

-- RLS: Org-scoped read
CREATE POLICY "Users view own org outfall aliases"
  ON outfall_aliases FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

-- RLS: Manager roles can create aliases
CREATE POLICY "Managers create outfall aliases"
  ON outfall_aliases FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid()
        AND r.name IN ('admin', 'environmental_manager', 'site_manager')
    )
  );

-- RLS: Service role full access (for Edge Function automation)
CREATE POLICY "Service role manages outfall aliases"
  ON outfall_aliases FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE outfall_aliases IS
  'Maps lab/permit outfall identifiers to canonical outfalls.id. Scoped per organization and permit.';

COMMENT ON COLUMN outfall_aliases.alias IS
  'The alias text as it appears in source files (e.g., "DO16", "1.0", "Outfall 001")';

COMMENT ON COLUMN outfall_aliases.match_method IS
  'How this alias was resolved: exact (case-insensitive), zero_strip (001=1), digits_only (DO16=16), user_confirmed';
