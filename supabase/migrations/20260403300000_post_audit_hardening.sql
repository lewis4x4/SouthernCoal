-- Post-Audit Hardening Migration
-- Fixes identified in comprehensive codebase audit (2026-04-03)
--
-- 1. Tighten consent_decree_obligations INSERT policy to org-scoped
-- 2. Add missing indexes on corrective_actions user FK columns
-- 3. Add ON DELETE SET NULL to corrective_actions user FK columns

-- ============================================================================
-- 1. Fix overly permissive INSERT policy on consent_decree_obligations
-- Old: WITH CHECK (true) — allows any authenticated user to insert for any org
-- New: WITH CHECK (organization_id = get_user_org_id()) — org-scoped
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert obligations" ON consent_decree_obligations;
CREATE POLICY "Authenticated users can insert obligations"
  ON consent_decree_obligations FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

-- ============================================================================
-- 2. Missing indexes on corrective_actions user FK columns
-- These columns are frequently used in "my assigned CAs" queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_corrective_actions_assigned_to
  ON corrective_actions (followup_assigned_to)
  WHERE followup_assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_corrective_actions_responsible
  ON corrective_actions (responsible_person_id)
  WHERE responsible_person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_corrective_actions_approved_by
  ON corrective_actions (approved_by_id)
  WHERE approved_by_id IS NOT NULL;

-- ============================================================================
-- 3. Add ON DELETE SET NULL to corrective_actions user FK columns
-- Prevents orphaned records if a user profile is deleted
-- ============================================================================
DO $$
DECLARE
  col_rec RECORD;
  fk_cols text[] := ARRAY[
    'followup_assigned_to',
    'responsible_person_id',
    'approved_by_id',
    'verified_by',
    'closed_by'
  ];
  col_name text;
BEGIN
  FOREACH col_name IN ARRAY fk_cols LOOP
    -- Drop existing FK constraint if any, then re-add with ON DELETE SET NULL
    FOR col_rec IN
      SELECT con.conname
      FROM pg_constraint con
        JOIN pg_attribute att ON att.attnum = ANY(con.conkey)
          AND att.attrelid = con.conrelid
      WHERE con.conrelid = 'corrective_actions'::regclass
        AND con.contype = 'f'
        AND att.attname = col_name
    LOOP
      EXECUTE format('ALTER TABLE corrective_actions DROP CONSTRAINT %I', col_rec.conname);
      EXECUTE format(
        'ALTER TABLE corrective_actions ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES user_profiles(id) ON DELETE SET NULL',
        col_rec.conname, col_name
      );
    END LOOP;
  END LOOP;
END $$;
