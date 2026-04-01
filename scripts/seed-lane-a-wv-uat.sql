-- =============================================================================
-- Lane A Milestone 1 — SCC WV UAT / Field Test seed (STAGING ONLY)
-- =============================================================================
-- Synthetic org + WV site + permit + outfalls + field visits for dispatch/route
-- QA. Aligns with FIELD_DISPATCH_STATE_CODE = 'WV' (site → states.code).
--
-- Prerequisites — auth users with EXACTLY these emails (script resolves auth.users.id):
--   Option A: npm run seed:wv-uat-auth  (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env)
--   Option B: Supabase Dashboard → Authentication → Users → Add user, Auto-confirm, set password
--   Emails:
--        wv-uat-sampler@invalid.scc.local
--        wv-uat-envmgr@invalid.scc.local
--        wv-uat-admin@invalid.scc.local
--        wv-uat-readonly@invalid.scc.local
--
-- Run this file in the Supabase SQL Editor as postgres (or any role that bypasses
-- RLS). Do NOT run against production.
--
-- After seeding, refresh "today" for route lists (optional, re-run anytime):
--   UPDATE field_visits
--   SET scheduled_date = (now() AT TIME ZONE 'America/New_York')::date
--   WHERE organization_id = 'f0000001-0001-4001-8001-000000000001'::uuid;
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Stable UUIDs (handoff / docs / golden path)
-- ---------------------------------------------------------------------------
-- Organization
--   f0000001-0001-4001-8001-000000000001
-- Site
--   f0000002-0002-4002-8002-000000000002
-- Permit (fake number WV-UAT-FAKE-001)
--   f0000003-0003-4003-8003-000000000003
-- Outfalls 001 / 002 / 003
--   f0000004-0004-4004-8004-000000000001
--   f0000004-0004-4004-8004-000000000002
--   f0000004-0004-4004-8004-000000000003
-- Visits (use these in /field/visits/{id})
--   f00000c1-0001-4001-8001-000000000001  → sample_collected golden path
--   f00000c2-0002-4002-8002-000000000002  → no_discharge golden path
--   f00000c3-0003-4003-8003-000000000003  → access_issue golden path
--   f00000c4-0004-4004-8004-000000000004  → spare / org-wide route row
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_org_id constant uuid := 'f0000001-0001-4001-8001-000000000001'::uuid;
  v_site_id constant uuid := 'f0000002-0002-4002-8002-000000000002'::uuid;
  v_permit_id constant uuid := 'f0000003-0003-4003-8003-000000000003'::uuid;
  v_of1 constant uuid := 'f0000004-0004-4004-8004-000000000001'::uuid;
  v_of2 constant uuid := 'f0000004-0004-4004-8004-000000000002'::uuid;
  v_of3 constant uuid := 'f0000004-0004-4004-8004-000000000003'::uuid;
  v_visit_sample constant uuid := 'f00000c1-0001-4001-8001-000000000001'::uuid;
  v_visit_nd constant uuid := 'f00000c2-0002-4002-8002-000000000002'::uuid;
  v_visit_access constant uuid := 'f00000c3-0003-4003-8003-000000000003'::uuid;
  v_visit_extra constant uuid := 'f00000c4-0004-4004-8004-000000000004'::uuid;

  v_wv_state_id uuid;
  v_sampler uuid;
  v_env uuid;
  v_admin uuid;
  v_readonly uuid;
  v_route_date date := (now() AT TIME ZONE 'America/New_York')::date;

  v_role_sampler uuid;
  v_role_env uuid;
  v_role_admin uuid;
  v_role_ro uuid;
BEGIN
  SELECT id INTO v_wv_state_id FROM public.states WHERE code = 'WV' LIMIT 1;
  IF v_wv_state_id IS NULL THEN
    RAISE EXCEPTION 'states.code = WV not found; seed WV state row before running this script';
  END IF;

  SELECT id INTO v_sampler FROM auth.users WHERE email = 'wv-uat-sampler@invalid.scc.local' LIMIT 1;
  SELECT id INTO v_env FROM auth.users WHERE email = 'wv-uat-envmgr@invalid.scc.local' LIMIT 1;
  SELECT id INTO v_admin FROM auth.users WHERE email = 'wv-uat-admin@invalid.scc.local' LIMIT 1;
  SELECT id INTO v_readonly FROM auth.users WHERE email = 'wv-uat-readonly@invalid.scc.local' LIMIT 1;

  IF v_sampler IS NULL OR v_env IS NULL OR v_admin IS NULL OR v_readonly IS NULL THEN
    RAISE EXCEPTION 'Missing auth user(s). Create all four @invalid.scc.local users in Dashboard first (see file header).';
  END IF;

  SELECT id INTO v_role_sampler FROM public.roles WHERE name = 'field_sampler' LIMIT 1;
  SELECT id INTO v_role_env FROM public.roles WHERE name = 'environmental_manager' LIMIT 1;
  SELECT id INTO v_role_admin FROM public.roles WHERE name = 'admin' LIMIT 1;
  SELECT id INTO v_role_ro FROM public.roles WHERE name = 'read_only' LIMIT 1;
  IF v_role_sampler IS NULL OR v_role_env IS NULL OR v_role_admin IS NULL OR v_role_ro IS NULL THEN
    RAISE EXCEPTION 'Missing roles row(s). Expected field_sampler, environmental_manager, admin, read_only.';
  END IF;

  -- Org (isolated tenant)
  -- org_type: run `SELECT DISTINCT org_type FROM organizations;` if 'subsidiary' is wrong
  INSERT INTO public.organizations (id, org_type, name)
  VALUES (v_org_id, 'subsidiary', 'SCC WV Field Test')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

  -- Site → WV (dispatch filter uses sites → states.code)
  -- site_type: surface_mine|underground_mine|prep_plant|loadout|reclamation|office|other
  INSERT INTO public.sites (
    id, organization_id, name, site_type, state_id, city, county
  ) VALUES (
    v_site_id,
    v_org_id,
    'UAT Slate Creek Bench (FAKE)',
    'surface_mine',
    v_wv_state_id,
    'Charleston',
    'Kanawha'
  )
  ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    name = EXCLUDED.name,
    state_id = EXCLUDED.state_id;

  -- Fake NPDES permit (no real permit number)
  INSERT INTO public.npdes_permits (
    id,
    organization_id,
    site_id,
    state_id,
    permit_number,
    permit_type,
    status,
    permittee_name,
    facility_name,
    issuing_agency,
    issued_date,
    effective_date,
    expiration_date
  ) VALUES (
    v_permit_id,
    v_org_id,
    v_site_id,
    v_wv_state_id,
    'WV-UAT-FAKE-001',
    'individual',
    'active',
    'Southern Coal UAT Test Co (FAKE)',
    'UAT Slate Creek Bench (FAKE)',
    'WVDEP',
    v_route_date - 365,
    v_route_date - 300,
    v_route_date + 3650
  )
  ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    site_id = EXCLUDED.site_id,
    permit_number = EXCLUDED.permit_number,
    status = EXCLUDED.status;

  -- Outfalls (lat/long for route map / coords)
  -- site_id must be set so org-scoped outfall RLS can see these rows during field visit updates.
  INSERT INTO public.outfalls (
    id, permit_id, site_id, outfall_number, is_active, latitude, longitude
  ) VALUES
    (v_of1, v_permit_id, v_site_id, '001', true, 38.3491, -81.6322),
    (v_of2, v_permit_id, v_site_id, '002', true, 38.3510, -81.6290),
    (v_of3, v_permit_id, v_site_id, '003', true, 38.3475, -81.6345)
  ON CONFLICT (id) DO UPDATE SET
    permit_id = EXCLUDED.permit_id,
    site_id = EXCLUDED.site_id,
    outfall_number = EXCLUDED.outfall_number,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude;

  -- Profiles (match app: first_name, last_name)
  INSERT INTO public.user_profiles (id, email, first_name, last_name, organization_id, is_active)
  VALUES
    (v_sampler, 'wv-uat-sampler@invalid.scc.local', 'UAT', 'Sampler', v_org_id, true),
    (v_env, 'wv-uat-envmgr@invalid.scc.local', 'UAT', 'Env Manager', v_org_id, true),
    (v_admin, 'wv-uat-admin@invalid.scc.local', 'UAT', 'Admin', v_org_id, true),
    (v_readonly, 'wv-uat-readonly@invalid.scc.local', 'UAT', 'ReadOnly', v_org_id, true)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    organization_id = EXCLUDED.organization_id,
    is_active = true;

  -- Role assignments (granted_by = admin)
  DELETE FROM public.user_role_assignments
  WHERE user_id IN (v_sampler, v_env, v_admin, v_readonly);

  INSERT INTO public.user_role_assignments (user_id, role_id, granted_by, granted_at) VALUES
    (v_sampler, v_role_sampler, v_admin, now()),
    (v_env, v_role_env, v_admin, now()),
    (v_admin, v_role_admin, v_admin, now()),
    (v_readonly, v_role_ro, v_admin, now());

  -- Field visits: all assigned to sampler, dispatched by env manager, dated for “today” in org TZ
  INSERT INTO public.field_visits (
    id,
    organization_id,
    permit_id,
    outfall_id,
    assigned_to,
    assigned_by,
    scheduled_date,
    visit_status,
    field_notes
  ) VALUES
    (
      v_visit_sample,
      v_org_id,
      v_permit_id,
      v_of1,
      v_sampler,
      v_env,
      v_route_date,
      'assigned',
      'UAT: golden path — sample_collected (add COC + outlet flow before complete).'
    ),
    (
      v_visit_nd,
      v_org_id,
      v_permit_id,
      v_of2,
      v_sampler,
      v_env,
      v_route_date,
      'assigned',
      'UAT: golden path — no_discharge (photo + narrative required).'
    ),
    (
      v_visit_access,
      v_org_id,
      v_permit_id,
      v_of3,
      v_sampler,
      v_env,
      v_route_date,
      'assigned',
      'UAT: golden path — access_issue (photo + narrative required).'
    ),
    (
      v_visit_extra,
      v_org_id,
      v_permit_id,
      v_of3,
      v_sampler,
      v_env,
      v_route_date,
      'assigned',
      'UAT: spare stop same outfall as access_issue row — schedule/conflict tests.'
    )
  ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    permit_id = EXCLUDED.permit_id,
    outfall_id = EXCLUDED.outfall_id,
    assigned_to = EXCLUDED.assigned_to,
    assigned_by = EXCLUDED.assigned_by,
    scheduled_date = EXCLUDED.scheduled_date,
    visit_status = EXCLUDED.visit_status,
    field_notes = EXCLUDED.field_notes;

  RAISE NOTICE 'SCC WV UAT seed OK. org_id=%, route_date=%', v_org_id, v_route_date;
END $$;

COMMIT;

-- Handoff: list visits (copy ids for staging closure worksheet)
SELECT fv.id AS visit_id,
       fv.scheduled_date,
       fv.visit_status,
       fv.field_notes
FROM public.field_visits fv
WHERE fv.organization_id = 'f0000001-0001-4001-8001-000000000001'::uuid
ORDER BY fv.created_at;
