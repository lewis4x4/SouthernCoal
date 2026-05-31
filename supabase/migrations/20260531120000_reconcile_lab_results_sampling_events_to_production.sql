-- ============================================================================
-- Migration: Reconcile lab_results + sampling_events to PRODUCTION-TRUTH schema
-- Date: 2026-05-31
-- Author: reconciliation pass (generated from live introspection of project
--         zymenlnwyzpnohljwifx on 2026-05-31, cross-checked against the
--         2026-05-19 prod dump in scc-os/backup-restore-artifacts/)
--
-- WHY THIS EXISTS
-- ---------------
-- The committed migration 20260217170009_create_lab_results.sql describes an
-- OBSOLETE early design of `sampling_events` and `lab_results`. Production was
-- migrated out-of-band to a richer schema by changes that were never committed to
-- this repo (the "repo truth vs DB truth" drift the team has flagged). Evidence:
--   * The deployed import-lab-data EF (index.ts:490-496) and the detect_exceedance()
--     trigger (20260218170004:68) write/read is_non_detect / analyzed_date /
--     hold_time_met / result_text — columns the committed CREATE never defines.
--   * 20260223023511_fix_lab_import_schema.sql already does
--     `ALTER TABLE sampling_events ALTER COLUMN site_id DROP NOT NULL` and adds an
--     outfall->permit->org INSERT policy — neither of which the committed CREATE
--     produces. So a fresh `supabase db reset` of this repo is ALREADY internally
--     inconsistent before this file runs.
--   * Live introspection (2026-05-31) shows both tables carry a different column
--     set, an RLS model scoped via sampling_events.site_id -> sites.organization_id
--     (+ parent-org hierarchy), different indexes, and CHECK constraints.
--   * The scc-os repo (a second app on this same DB) models lab_results with the
--     live columns in src/lib/types.ts and writes them from parse-justice-edd —
--     independent confirmation of the live shape.
--
-- DESIGN: ADDITIVE + RLS-CONVERGENCE, ZERO DESTRUCTIVE OPS
-- -------------------------------------------------------
-- This migration:
--   * ADDs every column the live code / triggers / RLS require (so the pipeline
--     works on any environment), using ADD COLUMN IF NOT EXISTS.
--   * CONVERGES the RLS policies to the production definitions (drops the obsolete
--     organization_id-based policy NAMES and creates the production site_id-based
--     ones). This matters because the committed org-based SELECT policy would hide
--     all rows on a fresh DB (the import path sets site_id/outfall, not org).
--   * Ensures the production indexes and CHECK constraints exist.
--   * Does NOT drop or rename the legacy committed columns
--     (below_detection / analysis_date / hold_time_compliant / hold_time_days /
--      raw_value / raw_parameter_name / row_number on lab_results;
--      organization_id / sampler_name / latitude / longitude / stream_name /
--      import_id / source_file_id on sampling_events). They are harmless, unused,
--      nullable, and dropping them risks breaking committed function/trigger bodies
--      on a fresh replay. Removing them is the job of the BASELINE-SNAPSHOT step
--      (see NOTE 3) once every function body has been audited.
--
-- SAFETY: it is a near no-op on production (every live object already exists; the
-- policy drop+recreate is identical) and converges any environment that ALREADY
-- HAS these tables (e.g. a clone or Supabase branch of prod) to the canonical
-- lab/sample shape. NOTE: the committed migration set is NOT a from-zero history —
-- the foundational tables (organizations, sites, user_profiles, outfalls,
-- npdes_permits, parameters, data_imports, precipitation_events) are NOT created by
-- any committed migration (the earliest, 20260209170001, only adds RLS to
-- pre-existing tables). So `supabase db reset` does not cleanly replay this repo
-- today; true replayability requires the baseline snapshot in NOTE 3. The value of
-- this file is (a) documenting the true lab/sample schema in version control and
-- (b) a correct, idempotent converger for prod and prod-derived environments.
-- Verified (2026-05-31): NO views/matviews depend on these two tables, so the only
-- column dependencies are RLS policies, which are recreated here.
--
-- lab_results' RLS depends on sampling_events.site_id, so sampling_events is
-- reconciled in the same migration even though the task was framed as "lab_results".
--
-- NOT APPLIED to production by its author (prod already matches). Review, then
-- apply via the normal pipeline / verify with a local `supabase db reset`.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. Converge RLS policy NAMES first (drop obsolete; production policies created
--    in section 3). Dropping a policy never touches column data and removes the
--    only dependency that would otherwise complicate column changes.
-- ============================================================================
ALTER TABLE public.sampling_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_results     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org sampling events"        ON public.sampling_events;
DROP POLICY IF EXISTS "Users can insert own org sampling events"      ON public.sampling_events;
DROP POLICY IF EXISTS "Service role full access to sampling events"   ON public.sampling_events;
DROP POLICY IF EXISTS "Users can view own org lab results"            ON public.lab_results;
DROP POLICY IF EXISTS "Users can insert lab results for own org events" ON public.lab_results;
DROP POLICY IF EXISTS "Service role full access to lab results"       ON public.lab_results;

-- ============================================================================
-- 1. sampling_events -> ensure production columns exist (additive)
-- ============================================================================
ALTER TABLE public.sampling_events ADD COLUMN IF NOT EXISTS site_id uuid;
ALTER TABLE public.sampling_events ADD COLUMN IF NOT EXISTS sampled_by uuid;
ALTER TABLE public.sampling_events ADD COLUMN IF NOT EXISTS sample_type text;
ALTER TABLE public.sampling_events ADD COLUMN IF NOT EXISTS field_notes text;
ALTER TABLE public.sampling_events ADD COLUMN IF NOT EXISTS weather_conditions text;
ALTER TABLE public.sampling_events ADD COLUMN IF NOT EXISTS chain_of_custody_id text;
ALTER TABLE public.sampling_events ADD COLUMN IF NOT EXISTS lab_received_date date;
ALTER TABLE public.sampling_events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.sampling_events ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.sampling_events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.sampling_events ADD COLUMN IF NOT EXISTS precipitation_event_id uuid;
ALTER TABLE public.sampling_events ADD COLUMN IF NOT EXISTS is_precipitation_sample boolean DEFAULT false;
ALTER TABLE public.sampling_events ADD COLUMN IF NOT EXISTS precipitation_inches_24hr numeric;

ALTER TABLE public.sampling_events ALTER COLUMN sample_time SET DEFAULT '00:00:00'::time;
-- site_id is nullable in production (lab EDD imports derive outfall, not site)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='sampling_events'
               AND column_name='site_id' AND is_nullable='NO') THEN
    ALTER TABLE public.sampling_events ALTER COLUMN site_id DROP NOT NULL;
  END IF;
END $$;

-- FKs (guarded)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sampling_events_site_id_fkey') THEN
    ALTER TABLE public.sampling_events ADD CONSTRAINT sampling_events_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES public.sites(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sampling_events_sampled_by_fkey') THEN
    ALTER TABLE public.sampling_events ADD CONSTRAINT sampling_events_sampled_by_fkey
      FOREIGN KEY (sampled_by) REFERENCES public.user_profiles(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_sampling_events_precipitation_event') THEN
    ALTER TABLE public.sampling_events ADD CONSTRAINT fk_sampling_events_precipitation_event
      FOREIGN KEY (precipitation_event_id) REFERENCES public.precipitation_events(id) ON DELETE SET NULL;
  END IF;
END $$;

-- CHECK constraints (guarded)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sampling_events_sample_type_check') THEN
    ALTER TABLE public.sampling_events ADD CONSTRAINT sampling_events_sample_type_check
      CHECK (sample_type = ANY (ARRAY['grab','composite_24hr','composite_flow','calculated','continuous']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sampling_events_status_check') THEN
    ALTER TABLE public.sampling_events ADD CONSTRAINT sampling_events_status_check
      CHECK (status = ANY (ARRAY['pending','in_lab','results_received','validated','rejected']));
  END IF;
END $$;

-- Production indexes (additive; legacy committed indexes are left in place)
CREATE INDEX IF NOT EXISTS idx_sampling_events_outfall      ON public.sampling_events (outfall_id);
CREATE INDEX IF NOT EXISTS idx_sampling_events_outfall_date ON public.sampling_events (outfall_id, sample_date);
CREATE INDEX IF NOT EXISTS idx_sampling_events_site         ON public.sampling_events (site_id);
CREATE INDEX IF NOT EXISTS idx_sampling_events_site_date    ON public.sampling_events (site_id, sample_date);
CREATE INDEX IF NOT EXISTS idx_sampling_events_sampled_by   ON public.sampling_events (sampled_by);
CREATE INDEX IF NOT EXISTS idx_sampling_events_precip       ON public.sampling_events (precipitation_event_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sampling_events_unique_event
  ON public.sampling_events (outfall_id, sample_date, sample_time);

-- ============================================================================
-- 2. lab_results -> ensure production columns exist (additive)
-- ============================================================================
ALTER TABLE public.lab_results ADD COLUMN IF NOT EXISTS result_text text;
ALTER TABLE public.lab_results ADD COLUMN IF NOT EXISTS is_non_detect boolean NOT NULL DEFAULT false;
ALTER TABLE public.lab_results ADD COLUMN IF NOT EXISTS analyzed_date date;
ALTER TABLE public.lab_results ADD COLUMN IF NOT EXISTS hold_time_met boolean;
ALTER TABLE public.lab_results ADD COLUMN IF NOT EXISTS detection_limit numeric;
ALTER TABLE public.lab_results ADD COLUMN IF NOT EXISTS method_detection_limit numeric;
ALTER TABLE public.lab_results ADD COLUMN IF NOT EXISTS quantification_limit numeric;
ALTER TABLE public.lab_results ADD COLUMN IF NOT EXISTS minimum_level numeric;
ALTER TABLE public.lab_results ADD COLUMN IF NOT EXISTS method text;
ALTER TABLE public.lab_results ADD COLUMN IF NOT EXISTS lab_qc_passed boolean DEFAULT true;
ALTER TABLE public.lab_results ADD COLUMN IF NOT EXISTS duplicate_rpd numeric;
ALTER TABLE public.lab_results ADD COLUMN IF NOT EXISTS sample_matrix text DEFAULT 'water'::text;
ALTER TABLE public.lab_results ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- production `unit` is NOT NULL; enforce only when no offending rows exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lab_results WHERE unit IS NULL) THEN
    ALTER TABLE public.lab_results ALTER COLUMN unit SET NOT NULL;
  END IF;
END $$;

-- CHECK constraint (sample_matrix domain)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lab_results_sample_matrix_check') THEN
    ALTER TABLE public.lab_results ADD CONSTRAINT lab_results_sample_matrix_check
      CHECK (sample_matrix = ANY (ARRAY['water','sediment','tissue','air','soil']));
  END IF;
END $$;

-- import_id FK (guarded)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lab_results_import_id_fkey') THEN
    ALTER TABLE public.lab_results ADD CONSTRAINT lab_results_import_id_fkey
      FOREIGN KEY (import_id) REFERENCES public.data_imports(id);
  END IF;
END $$;

-- Production indexes (additive)
CREATE INDEX IF NOT EXISTS idx_lab_results_sampling_event  ON public.lab_results (sampling_event_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_parameter       ON public.lab_results (parameter_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_event_parameter ON public.lab_results (sampling_event_id, parameter_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_param_event     ON public.lab_results (parameter_id, sampling_event_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_import_not_null ON public.lab_results (import_id) WHERE import_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_results_unique_result
  ON public.lab_results (sampling_event_id, parameter_id);

-- ============================================================================
-- 3. Production RLS policies (drop-then-create = idempotent). Scoped via
--    sampling_events.site_id -> sites.organization_id with parent-org hierarchy;
--    INSERT scoped via outfall -> npdes_permits -> user_profiles.
-- ============================================================================

-- 3a. sampling_events
DROP POLICY IF EXISTS "Users can read org sampling events" ON public.sampling_events;
CREATE POLICY "Users can read org sampling events"
  ON public.sampling_events FOR SELECT TO authenticated
  USING (
    site_id IN (
      SELECT s.id FROM sites s
      WHERE s.organization_id = get_user_org_id()
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = get_user_org_id())
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = (SELECT parent_id FROM organizations WHERE id = get_user_org_id()))
    )
  );

DROP POLICY IF EXISTS "Users can insert own org sampling_events" ON public.sampling_events;
CREATE POLICY "Users can insert own org sampling_events"
  ON public.sampling_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM outfalls o
        JOIN npdes_permits p ON o.permit_id = p.id
        JOIN user_profiles up ON up.organization_id = p.organization_id
      WHERE o.id = sampling_events.outfall_id AND up.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own org sampling_events" ON public.sampling_events;
CREATE POLICY "Users can update own org sampling_events"
  ON public.sampling_events FOR UPDATE TO authenticated
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

DROP POLICY IF EXISTS "Users can delete own org sampling_events" ON public.sampling_events;
CREATE POLICY "Users can delete own org sampling_events"
  ON public.sampling_events FOR DELETE TO authenticated
  USING (
    site_id IN (
      SELECT s.id FROM sites s
      WHERE s.organization_id = get_user_org_id()
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = get_user_org_id())
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = (SELECT parent_id FROM organizations WHERE id = get_user_org_id()))
    )
  );

-- 3b. lab_results (scoped through its sampling_event -> site -> org)
DROP POLICY IF EXISTS "Users can read org lab results" ON public.lab_results;
CREATE POLICY "Users can read org lab results"
  ON public.lab_results FOR SELECT TO authenticated
  USING (
    sampling_event_id IN (
      SELECT se.id FROM sampling_events se JOIN sites s ON se.site_id = s.id
      WHERE s.organization_id = get_user_org_id()
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = get_user_org_id())
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = (SELECT parent_id FROM organizations WHERE id = get_user_org_id()))
    )
  );

DROP POLICY IF EXISTS "Users can insert own org lab_results" ON public.lab_results;
CREATE POLICY "Users can insert own org lab_results"
  ON public.lab_results FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sampling_events se
        JOIN outfalls o ON se.outfall_id = o.id
        JOIN npdes_permits p ON o.permit_id = p.id
        JOIN user_profiles up ON up.organization_id = p.organization_id
      WHERE se.id = lab_results.sampling_event_id AND up.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own org lab_results" ON public.lab_results;
CREATE POLICY "Users can update own org lab_results"
  ON public.lab_results FOR UPDATE TO authenticated
  USING (
    sampling_event_id IN (
      SELECT se.id FROM sampling_events se JOIN sites s ON s.id = se.site_id
      WHERE s.organization_id = get_user_org_id()
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = get_user_org_id())
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = (SELECT parent_id FROM organizations WHERE id = get_user_org_id()))
    )
  )
  WITH CHECK (
    sampling_event_id IN (
      SELECT se.id FROM sampling_events se JOIN sites s ON s.id = se.site_id
      WHERE s.organization_id = get_user_org_id()
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = get_user_org_id())
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = (SELECT parent_id FROM organizations WHERE id = get_user_org_id()))
    )
  );

DROP POLICY IF EXISTS "Users can delete own org lab_results" ON public.lab_results;
CREATE POLICY "Users can delete own org lab_results"
  ON public.lab_results FOR DELETE TO authenticated
  USING (
    sampling_event_id IN (
      SELECT se.id FROM sampling_events se JOIN sites s ON s.id = se.site_id
      WHERE s.organization_id = get_user_org_id()
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = get_user_org_id())
         OR s.organization_id IN (SELECT id FROM organizations WHERE parent_id = (SELECT parent_id FROM organizations WHERE id = get_user_org_id()))
    )
  );

COMMIT;

-- ============================================================================
-- POST-MIGRATION NOTES / FOLLOW-UPS (not executed here)
-- ============================================================================
-- 1. EF BUG: supabase/functions/import-lab-data/index.ts:421 inserts
--    sampling_events.status = 'imported', which VIOLATES sampling_events_status_check
--    (allowed: pending/in_lab/results_received/validated/rejected). Change it to a
--    valid value (e.g. 'results_received') before relying on lab imports — otherwise
--    every import insert will be rejected by the CHECK constraint.
-- 2. DMR ENGINE: calculate_dmr_values() (20260403900000_phase7_dmr_pipeline.sql)
--    ignores non-detects. With detection_limit / method_detection_limit /
--    minimum_level now guaranteed present, wire half-MDL (WV) substitution into the
--    DMR average math (roadmap tasks 3.11 / 5.02).
-- 3. BASELINE / SOURCE-OF-TRUTH: This file makes the committed schema a SUPERSET of
--    production (legacy committed columns are retained, not dropped). Two repos
--    (SouthernCoal + scc-os) deploy migrations to this one DB. The clean long-term
--    fix is to (a) freeze scc-os DDL, (b) commit a fresh `supabase db dump
--    --schema public` as an authoritative baseline that EXACTLY matches prod, and
--    (c) retire the obsolete 20260217170009_create_lab_results.sql. Dropping the
--    legacy columns should happen there, only after auditing every function/trigger
--    body (e.g. detect_exceedance) for references to the old names. The same dump
--    also closes the bigger gap that the foundational tables (organizations, sites,
--    user_profiles, outfalls, npdes_permits, parameters, data_imports,
--    precipitation_events) have no committed CREATE at all.
-- 4. STALE FRONTEND TYPE: src/types/database.ts still types lab_results with
--    below_detection / hold_time_compliant; update it to the live columns
--    (is_non_detect / hold_time_met / result_text / detection_limit / ...).
-- ============================================================================
