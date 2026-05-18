-- Patrol read-only export of RLS policies for SUP-001 (Overwatch Sentinel).
-- Replaces ad-hoc exec_sql usage; service_role only.

CREATE OR REPLACE FUNCTION public.patrol_export_rls_policies()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'schemaname', p.schemaname,
        'tablename', p.tablename,
        'policyname', p.policyname,
        'permissive', p.permissive,
        'roles', p.roles,
        'cmd', p.cmd,
        'qual', p.qual,
        'with_check', p.with_check
      )
      ORDER BY p.schemaname, p.tablename, p.policyname, p.cmd
    ),
    '[]'::jsonb
  )
  FROM pg_policies p
  WHERE p.schemaname IN ('public', 'storage');
$$;

COMMENT ON FUNCTION public.patrol_export_rls_policies() IS
  'Read-only RLS policy snapshot for Overwatch SUP-001. Callable by service_role only.';

REVOKE ALL ON FUNCTION public.patrol_export_rls_policies() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patrol_export_rls_policies() FROM anon;
REVOKE ALL ON FUNCTION public.patrol_export_rls_policies() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.patrol_export_rls_policies() TO service_role;
