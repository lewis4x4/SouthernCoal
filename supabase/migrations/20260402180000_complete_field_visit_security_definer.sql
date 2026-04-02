-- complete_field_visit performs INSERTs into governance_issues and governance_issue_events.
-- As SECURITY INVOKER (PostgreSQL default), those inserts are checked with the *caller's* RLS.
-- The governance_issues INSERT policy requires organization_id = get_user_org_id() and
-- created_by = auth.uid(). Subtle mismatches (e.g. get_user_org_id() NULL so the function's
-- "visit org <> user org" guard does not fire, but WITH CHECK still fails) surface as:
--   new row violates row-level security policy for table "governance_issues"
--
-- Mark the RPC SECURITY DEFINER so RLS is evaluated for the function owner (postgres), which
-- bypasses RLS; the function body still enforces scope (visit org vs get_user_org_id(), etc.).
-- SET search_path closes search_path hijacking on DEFINER functions.

DO $migration$
DECLARE
  cmd text;
BEGIN
  SELECT format(
    'ALTER FUNCTION %I.%I(%s) SECURITY DEFINER SET search_path = public',
    n.nspname,
    p.proname,
    pg_catalog.pg_get_function_identity_arguments(p.oid)
  )
  INTO cmd
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'complete_field_visit'
    AND n.nspname = 'public'
  LIMIT 1;

  IF cmd IS NULL THEN
    RAISE EXCEPTION 'complete_field_visit not found in public schema';
  END IF;

  EXECUTE cmd;
END
$migration$;
