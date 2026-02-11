-- ============================================================
-- Seed admin user: blewis@lewisinsurance.com
-- ============================================================
-- STEP 1: Create user via Supabase Dashboard
--   Authentication > Users > Add User
--   Email: blewis@lewisinsurance.com
--   Password: Sp33dy22
--   Check "Auto Confirm"
--   Copy the generated User UID
--
-- STEP 2: Run this SQL in SQL Editor (replace the UUID below)
-- ============================================================

DO $$
DECLARE
  uid uuid := '00000000-0000-0000-0000-000000000000'; -- REPLACE with actual UID from Dashboard
  org_id uuid;
  admin_role_id uuid;
BEGIN
  -- Get SCC parent org
  SELECT id INTO org_id
    FROM organizations
    ORDER BY created_at ASC
    LIMIT 1;

  -- Create user profile
  INSERT INTO user_profiles (id, email, first_name, last_name, organization_id, is_active, created_at, updated_at)
  VALUES (uid, 'blewis@lewisinsurance.com', 'Brian', 'Lewis', org_id, true, now(), now());

  -- Get admin role
  SELECT id INTO admin_role_id
    FROM roles
    WHERE name = 'admin'
    LIMIT 1;

  -- Assign admin role (global scope)
  INSERT INTO user_role_assignments (user_id, role_id, granted_by, granted_at)
  VALUES (uid, admin_role_id, uid, now());

  RAISE NOTICE 'Profile + admin role created for user % in org %', uid, org_id;
END $$;
