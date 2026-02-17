-- =============================================================================
-- Migration 001: Create parameter_aliases table
-- =============================================================================
-- Maps 100+ lab/permit parameter name variants to canonical parameters.id
-- Used by parse-lab-data-edd, parse-parameter-sheet, and other parsers
-- =============================================================================

CREATE TABLE parameter_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The canonical parameter this alias maps to
  parameter_id uuid NOT NULL REFERENCES parameters(id) ON DELETE CASCADE,

  -- The alias string (stored as-is, matched case-insensitively)
  alias text NOT NULL,

  -- Source context (helps identify where this alias came from)
  source text CHECK (source IN ('lab_edd', 'permit_sheet', 'dmr', 'netdmr', 'osmre', 'manual')),

  -- State-specific aliases (null = universal alias)
  state_code text CHECK (state_code IS NULL OR state_code IN ('AL', 'KY', 'TN', 'VA', 'WV')),

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Unique constraint: same alias can't exist twice for same state context
  CONSTRAINT parameter_aliases_unique UNIQUE (alias, state_code)
);

-- Index for fast lookup during parsing (case-insensitive)
CREATE INDEX idx_parameter_aliases_lookup
  ON parameter_aliases(lower(alias), state_code);

-- Index for parameter_id lookups
CREATE INDEX idx_parameter_aliases_parameter_id
  ON parameter_aliases(parameter_id);

-- Enable RLS
ALTER TABLE parameter_aliases ENABLE ROW LEVEL SECURITY;

-- RLS: Read-only for authenticated users (reference data)
CREATE POLICY "Authenticated users can read parameter aliases"
  ON parameter_aliases FOR SELECT TO authenticated
  USING (true);

-- RLS: Service role can manage (seeded/managed centrally)
CREATE POLICY "Service role manages parameter aliases"
  ON parameter_aliases FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE parameter_aliases IS
  'Maps lab/permit parameter name variants to canonical parameters.id. Used by Edge Function parsers for normalization.';

COMMENT ON COLUMN parameter_aliases.alias IS
  'The alias text as it appears in source files (e.g., "fe_tot", "iron (total)")';

COMMENT ON COLUMN parameter_aliases.source IS
  'Origin of alias: lab_edd (WV EDD files), permit_sheet (parameter sheets), dmr, netdmr (KY), osmre (TN), manual';

COMMENT ON COLUMN parameter_aliases.state_code IS
  'State-specific alias (null = universal). Allows state-specific name variants.';
