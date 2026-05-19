-- Patrol read-only connection pool stats for SUP-003 (Overwatch Sentinel).
-- service_role only; replaces direct pg_stat_activity access from patrol runtime.

CREATE OR REPLACE FUNCTION public.patrol_connection_pool_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH stats AS (
    SELECT
      (
        SELECT count(*)::integer
        FROM pg_stat_activity
        WHERE datname = current_database()
      ) AS active_connections,
      current_setting('max_connections')::integer AS max_connections
  )
  SELECT jsonb_build_object(
    'active_connections', s.active_connections,
    'max_connections', s.max_connections,
    'utilization_pct',
      CASE
        WHEN s.max_connections > 0 THEN round(
          (s.active_connections::numeric / s.max_connections::numeric) * 100,
          2
        )
        ELSE 0::numeric
      END,
    'captured_at', to_jsonb(now() AT TIME ZONE 'utc')
  )
  FROM stats s;
$$;

COMMENT ON FUNCTION public.patrol_connection_pool_stats() IS
  'Read-only connection pool utilization for Overwatch SUP-003. Callable by service_role only.';

REVOKE ALL ON FUNCTION public.patrol_connection_pool_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patrol_connection_pool_stats() FROM anon;
REVOKE ALL ON FUNCTION public.patrol_connection_pool_stats() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.patrol_connection_pool_stats() TO service_role;
