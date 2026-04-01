BEGIN;

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

  v_state_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.field_visits
    WHERE id IN (v_visit_sample, v_visit_nd, v_visit_access, v_visit_extra)
  ) THEN
    RAISE NOTICE 'WV UAT field visits not present; skipping UAT relationship repair.';
    RETURN;
  END IF;

  SELECT state_id
  INTO v_state_id
  FROM public.npdes_permits
  WHERE id = v_permit_id;

  IF v_state_id IS NULL THEN
    SELECT state_id
    INTO v_state_id
    FROM public.sites
    WHERE id = v_site_id;
  END IF;

  IF v_state_id IS NULL THEN
    RAISE NOTICE 'WV UAT permit/state context missing; skipping outfall repair.';
    RETURN;
  END IF;

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
    v_state_id,
    'WV-UAT-FAKE-001',
    'individual',
    'active',
    'Southern Coal UAT Test Co (FAKE)',
    'UAT Slate Creek Bench (FAKE)',
    'WVDEP',
    CURRENT_DATE - 365,
    CURRENT_DATE - 300,
    CURRENT_DATE + 3650
  )
  ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    site_id = EXCLUDED.site_id,
    state_id = EXCLUDED.state_id,
    permit_number = EXCLUDED.permit_number,
    status = EXCLUDED.status;

  INSERT INTO public.outfalls (
    id, permit_id, outfall_number, is_active, latitude, longitude
  ) VALUES
    (v_of1, v_permit_id, '001', true, 38.3491, -81.6322),
    (v_of2, v_permit_id, '002', true, 38.3510, -81.6290),
    (v_of3, v_permit_id, '003', true, 38.3475, -81.6345)
  ON CONFLICT (id) DO UPDATE SET
    permit_id = EXCLUDED.permit_id,
    outfall_number = EXCLUDED.outfall_number,
    is_active = EXCLUDED.is_active,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude;

  UPDATE public.field_visits
  SET
    organization_id = v_org_id,
    permit_id = v_permit_id,
    outfall_id = CASE id
      WHEN v_visit_sample THEN v_of1
      WHEN v_visit_nd THEN v_of2
      WHEN v_visit_access THEN v_of3
      WHEN v_visit_extra THEN v_of3
      ELSE outfall_id
    END
  WHERE id IN (v_visit_sample, v_visit_nd, v_visit_access, v_visit_extra);
END $$;

COMMIT;
