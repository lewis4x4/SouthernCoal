-- =============================================================================
-- Post-audit security hardening (2026-07-01)
-- P0: tom_memory RLS + revoke public table/RPC access
-- P0: Roadmap views → security_invoker (closes SECURITY DEFINER view lint)
-- P1: Mutable search_path on public functions
-- P1: Revoke anon EXECUTE on SECURITY DEFINER RPCs (SEC-003 companion)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- P0: tom_memory — not used by SCC frontend; service_role automation only
-- -----------------------------------------------------------------------------
ALTER TABLE public.tom_memory ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tom_memory FROM anon, authenticated;
GRANT ALL ON TABLE public.tom_memory TO service_role;

REVOKE ALL ON FUNCTION public.search_tom_memory(text, text, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.search_tom_memory_exact(text, text, integer) FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- P0: Roadmap sync views — evaluate RLS as caller, not view owner
-- -----------------------------------------------------------------------------
ALTER VIEW public.v_roadmap_sync_health SET (security_invoker = true);
ALTER VIEW public.v_roadmap_tasks_pending_linear_sync SET (security_invoker = true);

REVOKE ALL ON TABLE public.v_roadmap_sync_health FROM anon;
REVOKE ALL ON TABLE public.v_roadmap_tasks_pending_linear_sync FROM anon;

-- -----------------------------------------------------------------------------
-- P1: Pin search_path on all public functions missing it
-- Skips functions that already declare search_path in proconfig.
-- -----------------------------------------------------------------------------
DO $migration$
DECLARE
  r record;
  cmd text;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS func_name,
      pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    cmd := format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public',
      r.schema_name,
      r.func_name,
      r.args
    );
    EXECUTE cmd;
  END LOOP;
END
$migration$;

-- -----------------------------------------------------------------------------
-- P1: anon must not invoke SECURITY DEFINER RPCs directly
-- PUBLIC execute grant bypasses per-role REVOKE; revoke PUBLIC, re-grant roles.
-- -----------------------------------------------------------------------------
DO $migration$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS func
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.func);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.func);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.func);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.func);
  END LOOP;
END
$migration$;
