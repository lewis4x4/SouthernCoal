-- Lane C: Self-healing MSHA mine→org mapping (derived from MSHA Mines feed)

CREATE TABLE IF NOT EXISTS msha_controller_allowlist (
  controller_id text PRIMARY KEY,
  controller_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS msha_subsidiary_org (
  subsidiary_name text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  normalized_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS msha_mine_org_map (
  mine_id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  operator_name text NOT NULL,
  controller_id text NOT NULL,
  mine_name text,
  state text,
  mine_status text,
  source text NOT NULL DEFAULT 'derived' CHECK (source IN ('derived', 'seed', 'override')),
  is_active boolean NOT NULL DEFAULT true,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS msha_mine_review (
  mine_id text PRIMARY KEY,
  operator_name text,
  controller_id text,
  mine_name text,
  state text,
  mine_status text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS msha_mine_org_override (
  mine_id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  assigned_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE TABLE IF NOT EXISTS msha_map_drift_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL CHECK (run_type IN ('refresh', 'reconcile')),
  status text NOT NULL DEFAULT 'completed',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msha_mine_org_map_org_active
  ON msha_mine_org_map(organization_id, is_active);

CREATE INDEX IF NOT EXISTS idx_msha_mine_review_last_seen
  ON msha_mine_review(last_seen DESC);

ALTER TABLE msha_controller_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE msha_subsidiary_org ENABLE ROW LEVEL SECURITY;
ALTER TABLE msha_mine_org_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE msha_mine_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE msha_mine_org_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE msha_map_drift_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY msha_controller_allowlist_select ON msha_controller_allowlist
  FOR SELECT TO authenticated USING (true);

CREATE POLICY msha_subsidiary_org_select ON msha_subsidiary_org
  FOR SELECT TO authenticated USING (true);

CREATE POLICY msha_mine_org_map_select ON msha_mine_org_map
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY msha_mine_review_select ON msha_mine_review
  FOR SELECT TO authenticated
  USING (
    current_user_has_any_role(ARRAY[
      'admin', 'executive', 'environmental_manager', 'safety_manager',
      'coo', 'compliance_reviewer', 'chief_counsel'
    ])
  );

CREATE POLICY msha_mine_org_override_select ON msha_mine_org_override
  FOR SELECT TO authenticated
  USING (
    current_user_has_any_role(ARRAY['admin', 'executive', 'environmental_manager', 'safety_manager', 'coo'])
  );

CREATE POLICY msha_map_drift_log_select ON msha_map_drift_log
  FOR SELECT TO authenticated
  USING (
    current_user_has_any_role(ARRAY[
      'admin', 'executive', 'environmental_manager', 'safety_manager',
      'coo', 'compliance_reviewer'
    ])
  );

CREATE POLICY msha_service_role_all ON msha_controller_allowlist
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY msha_subsidiary_org_service ON msha_subsidiary_org
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY msha_mine_org_map_service ON msha_mine_org_map
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY msha_mine_review_service ON msha_mine_review
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY msha_mine_org_override_service ON msha_mine_org_override
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY msha_map_drift_log_service ON msha_map_drift_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO msha_controller_allowlist (controller_id, controller_name) VALUES
  ('0171761', 'JAMES C JUSTICE III'),
  ('C04355', 'JAMES C JUSTICE II'),
  ('0091855', 'JILLEAN L JUSTICE; JAMES C JUSTICE III')
ON CONFLICT (controller_id) DO NOTHING;

INSERT INTO msha_subsidiary_org (subsidiary_name, organization_id, normalized_name) VALUES
  ('Southern Coal Corporation', '2bffc35c-e2c4-4396-868f-207f80e1e2c4', 'SOUTHERN COAL'),
  ('Justice Coal of Alabama LLC', 'f2781e34-d361-4d06-b425-4bce40bcfbbf', 'JUSTICE COAL OF ALABAMA'),
  ('A & G Coal Corporation', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A AND G COAL'),
  ('Four Star Resources LLC', 'a9f640b0-e653-4485-a112-fddaeb75111a', 'FOUR STAR RESOURCES'),
  ('Infinity Energy Inc.', '8df27173-d0ad-4ee9-b8c1-f10c7bc40f48', 'INFINITY ENERGY'),
  ('Kentucky Fuel Corporation', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'KENTUCKY FUEL'),
  ('Sequoia Energy LLC', '775d4345-ce9c-4f64-b25e-f85bd9a929bf', 'SEQUOIA ENERGY'),
  ('Virginia Fuel Corporation', '0e9e271b-e315-46bc-8c03-2a7ec085e129', 'VIRGINIA FUEL'),
  ('National Coal LLC', '7df6b22e-d68d-4da7-9975-a2cdaebe20ce', 'NATIONAL COAL'),
  ('Premium Coal Company Inc.', '3877410c-dcc3-486f-beb1-af93a0fb3290', 'PREMIUM COAL'),
  ('S and H Mining Inc.', '1cda5cd5-bb86-491b-b725-4c941862162b', 'S AND H MINING'),
  ('Airway Resources L.L.C.', '078d2fea-a516-498d-8aa9-9b22b99a741e', 'AIRWAY RESOURCES'),
  ('Baden Reclamation Company', 'ac2eca1e-bf52-4aff-8c0c-fc807213d576', 'BADEN'),
  ('Black River Coal LLC', '4c65a05d-d906-4276-b8fc-68d42a51c8e8', 'BLACK RIVER COAL'),
  ('Chestnut Land Holdings LLC', '94394a52-0a40-4a37-bc02-d36a7762ffdd', 'CHESTNUT LAND'),
  ('Meg-Lynn Land Company Inc.', '492ff66f-4656-43be-aaf0-e9fb82bae67a', 'MEG-LYNN LAND'),
  ('Nine Mile Mining Inc.', 'e6ccdf47-ff6f-46e1-a40b-9757d8e9c1b2', 'NINE MILE MINING'),
  ('Cane Patch Mining Co. Inc.', 'f5868961-80a0-4edb-bb1b-53942ac6c8c6', 'CANE PATCH MINING'),
  ('Bluestone Resources Inc.', 'ac7c4d28-dfb0-40b3-b243-4da6fe81bc54', 'BLUESTONE RESOURCES'),
  ('Dynamic Energy Inc.', '3f87b8a1-1f35-459a-8e92-dc928f29d742', 'DYNAMIC ENERGY'),
  ('Greenthorn LLC', 'cf214f0d-0a06-475f-a675-39f3f0d88cb4', 'GREENTHORN'),
  ('Justice Highwall Mining Inc.', '389c1bb0-d42a-4ecf-bee2-c4b76d7f355d', 'JUSTICE HIGHWALL MINING'),
  ('National Resources Inc.', '1ebffac0-b27e-4710-82a5-39501ef0e0e8', 'NATIONAL RESOURCES'),
  ('Nufac Mining Company Inc.', '5804f55b-4597-484e-b757-f3a31da4394f', 'NUFAC MINING'),
  ('Pay Car Mining Inc.', 'e04b9bd6-10da-4736-921e-24e55ec08381', 'PAY CAR MINING'),
  ('Second Sterling Corp.', 'f3239b4e-9aa0-4263-8c9c-4cbe64146a25', 'SECOND STERLING'),
  ('Newgate Development of Beckley LLC', '5d3266c4-d04c-47f2-ad25-c93e611be1ae', 'NEWGATE OF BECKLEY')
ON CONFLICT (subsidiary_name) DO NOTHING;
-- Seed 106 validated mine→org mappings
INSERT INTO msha_mine_org_map (mine_id, organization_id, operator_name, controller_id, mine_name, state, mine_status, source, is_active)
VALUES
  ('1202356', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'Kentucky Fuel Corporation', '0171761', 'ADDCAR #1', 'KY', 'Abandoned', 'seed', true),
  ('1508211', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'Kentucky Fuel Corporation', '0171761', 'Hazard Star Loadout', 'KY', 'Abandoned', 'seed', true),
  ('1511906', '0e9e271b-e315-46bc-8c03-2a7ec085e129', 'Virginia Fuel Corporation', '0171761', 'VFC Preparation Plant', 'KY', 'Abandoned', 'seed', true),
  ('1513254', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'Kentucky Fuel Corporation', '0171761', 'K-2 Preparation Plant', 'KY', 'NonProducing', 'seed', true),
  ('1515682', '8df27173-d0ad-4ee9-b8c1-f10c7bc40f48', 'Infinity Energy Inc.', '0171761', 'Pine Mountain Prep Plant', 'KY', 'Abandoned', 'seed', true),
  ('1517021', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'Kentucky Fuel Corporation', '0171761', 'Jones Fork Plant', 'KY', 'NonProducing', 'seed', true),
  ('1517894', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'Kentucky Fuel Corporation', '0171761', 'KY Fuels E3RF', 'KY', 'Temporarily Idled', 'seed', true),
  ('1518093', '0e9e271b-e315-46bc-8c03-2a7ec085e129', 'Virginia Fuel Corporation', '0171761', 'VFC - Darty Gap', 'KY', 'Abandoned and Sealed', 'seed', true),
  ('1518341', '2bffc35c-e2c4-4396-868f-207f80e1e2c4', 'Southern Coal Corporation', '0171761', 'Liggett #1', 'KY', 'Abandoned', 'seed', true),
  ('1518525', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'Kentucky Fuel Corporation', '0171761', 'Kentucky River Surface Mine', 'KY', 'Abandoned', 'seed', true),
  ('1518589', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'Kentucky Fuel Corporation', '0171761', 'Jones Fork E-3', 'KY', 'Abandoned and Sealed', 'seed', true),
  ('1518608', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'Kentucky Fuel Corporation', '0171761', 'Salem #2', 'KY', 'Temporarily Idled', 'seed', true),
  ('1518694', '775d4345-ce9c-4f64-b25e-f85bd9a929bf', 'Sequoia Energy LLC', '0171761', 'Bardo #1', 'KY', 'Abandoned', 'seed', true),
  ('1518711', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'Kentucky Fuel Corporation', '0171761', 'Abundance # 1', 'KY', 'Abandoned and Sealed', 'seed', true),
  ('1518854', '775d4345-ce9c-4f64-b25e-f85bd9a929bf', 'Sequoia Energy LLC', '0171761', 'Liggett #3', 'KY', 'Abandoned and Sealed', 'seed', true),
  ('1518889', 'a9f640b0-e653-4485-a112-fddaeb75111a', 'Four Star Resources LLC', '0171761', 'Harlan Strip #1', 'KY', 'Abandoned and Sealed', 'seed', true),
  ('1518918', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'Kentucky Fuel Corporation', '0171761', 'Lost Creek Mine', 'KY', 'Abandoned', 'seed', true),
  ('1519171', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Job #5', 'KY', 'Abandoned', 'seed', true),
  ('1519290', '8df27173-d0ad-4ee9-b8c1-f10c7bc40f48', 'Infinity Energy Inc.', '0171761', 'Infinity #4', 'KY', 'Abandoned and Sealed', 'seed', true),
  ('1519304', '0e9e271b-e315-46bc-8c03-2a7ec085e129', 'Virginia Fuel Corporation', '0171761', 'VFC - Glenbrook Taggart Marker', 'KY', 'Abandoned', 'seed', true),
  ('1519316', '0e9e271b-e315-46bc-8c03-2a7ec085e129', 'Virginia Fuel Corporation', '0171761', 'VFC-Louder Creek E, F, G', 'KY', 'Abandoned', 'seed', true),
  ('1519462', '775d4345-ce9c-4f64-b25e-f85bd9a929bf', 'Sequoia Energy LLC', '0171761', 'Liggett #7', 'KY', 'Abandoned and Sealed', 'seed', true),
  ('1519586', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'Kentucky Fuel Corporation', '0171761', 'HWM MS0002', 'KY', 'Abandoned', 'seed', true),
  ('1519643', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'Kentucky Fuel Corporation', '0171761', 'SHM-16', 'KY', 'Abandoned', 'seed', true),
  ('1519756', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'Kentucky Fuel Corporation', '0171761', 'Salem #3', 'WV', 'NonProducing', 'seed', true),
  ('1519758', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'Kentucky Fuel Corporation', '0171761', 'ADDCAR #2', 'WV', 'Temporarily Idled', 'seed', true),
  ('4000665', '3877410c-dcc3-486f-beb1-af93a0fb3290', 'Premium Coal Company Inc.', '0171761', 'Premium Strip', 'TN', 'Abandoned', 'seed', true),
  ('4000699', '3877410c-dcc3-486f-beb1-af93a0fb3290', 'Premium Coal Company Inc.', '0171761', 'No 1 Surface Mine', 'TN', 'Abandoned', 'seed', true),
  ('4001106', '3877410c-dcc3-486f-beb1-af93a0fb3290', 'Premium Coal Company Inc.', '0171761', 'No 1 Tipple', 'TN', 'Abandoned', 'seed', true),
  ('4001138', '3877410c-dcc3-486f-beb1-af93a0fb3290', 'Premium Coal Company Inc.', '0171761', 'Briceville Plant', 'TN', 'Abandoned', 'seed', true),
  ('4001597', '1cda5cd5-bb86-491b-b725-4c941862162b', 'S and H Mining Inc.', '0171761', 'S & H #1 Mine', 'TN', 'Abandoned and Sealed', 'seed', true),
  ('4002045', '1cda5cd5-bb86-491b-b725-4c941862162b', 'S and H Mining Inc.', '0171761', 'S & H Mine #2', 'TN', 'Abandoned', 'seed', true),
  ('4002467', '3877410c-dcc3-486f-beb1-af93a0fb3290', 'Premium Coal Company Inc.', '0171761', 'Baldwin Plant', 'TN', 'NonProducing', 'seed', true),
  ('4002801', '1cda5cd5-bb86-491b-b725-4c941862162b', 'S and H Mining Inc.', '0171761', 'S & H Mine #8', 'TN', 'Abandoned and Sealed', 'seed', true),
  ('4003011', '1cda5cd5-bb86-491b-b725-4c941862162b', 'S and H Mining Inc.', '0171761', 'S & H Mine #7', 'TN', 'Abandoned and Sealed', 'seed', true),
  ('4003103', '3877410c-dcc3-486f-beb1-af93a0fb3290', 'Premium Coal Company Inc.', '0171761', '#1 Surface-002 Section', 'TN', 'Abandoned', 'seed', true),
  ('4003143', '1cda5cd5-bb86-491b-b725-4c941862162b', 'S and H Mining Inc.', '0171761', 'S & H # 10', 'TN', 'Abandoned', 'seed', true),
  ('4003150', '1cda5cd5-bb86-491b-b725-4c941862162b', 'S and H Mining Inc.', '0171761', 'S&H #11', 'TN', 'Abandoned', 'seed', true),
  ('4003189', '1cda5cd5-bb86-491b-b725-4c941862162b', 'S and H Mining Inc.', '0171761', 'S & H Mine #12', 'TN', 'Abandoned and Sealed', 'seed', true),
  ('4003204', '3877410c-dcc3-486f-beb1-af93a0fb3290', 'Premium Coal Company Inc.', '0171761', 'Mine No. 7', 'TN', 'Abandoned', 'seed', true),
  ('4003206', '3877410c-dcc3-486f-beb1-af93a0fb3290', 'Premium Coal Company Inc.', '0171761', 'Mine No 4', 'TN', 'Abandoned', 'seed', true),
  ('4003222', '3877410c-dcc3-486f-beb1-af93a0fb3290', 'Premium Coal Company Inc.', '0171761', 'Tipple No 1', 'TN', 'Abandoned', 'seed', true),
  ('4003272', '3877410c-dcc3-486f-beb1-af93a0fb3290', 'Premium Coal Company Inc.', '0171761', 'Mine No. 14', 'TN', 'Abandoned', 'seed', true),
  ('4003275', '3877410c-dcc3-486f-beb1-af93a0fb3290', 'Premium Coal Company Inc.', '0171761', 'Tn mine 3', 'TN', 'Abandoned', 'seed', true),
  ('4003279', '3877410c-dcc3-486f-beb1-af93a0fb3290', 'Premium Coal Company Inc.', '0171761', 'Mine No 17', 'TN', 'Abandoned', 'seed', true),
  ('4003320', '3877410c-dcc3-486f-beb1-af93a0fb3290', 'Premium Coal Company Inc.', '0171761', 'Tn mine 20', 'TN', 'Abandoned', 'seed', true),
  ('4003328', '3877410c-dcc3-486f-beb1-af93a0fb3290', 'Premium Coal Company Inc.', '0171761', 'Premium #5 Deep Mine', 'TN', 'Abandoned and Sealed', 'seed', true),
  ('4003407', '3877410c-dcc3-486f-beb1-af93a0fb3290', 'Premium Coal Company Inc.', '0171761', '#15 Mine', 'TN', 'Abandoned', 'seed', true),
  ('4003408', '1cda5cd5-bb86-491b-b725-4c941862162b', 'S and H Mining Inc.', '0171761', 'SH14', 'TN', 'Abandoned', 'seed', true),
  ('4402696', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Bullitt Transloader', 'VA', 'Abandoned', 'seed', true),
  ('4404534', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Prep Plant #2', 'VA', 'NonProducing', 'seed', true),
  ('4406230', '0e9e271b-e315-46bc-8c03-2a7ec085e129', 'Virginia Fuel Corporation', '0171761', 'VFC-Washer', 'VA', 'NonProducing', 'seed', true),
  ('4406548', '0e9e271b-e315-46bc-8c03-2a7ec085e129', 'Virginia Fuel Corporation', '0171761', 'Strip & Auger', 'VA', 'Abandoned', 'seed', true),
  ('4406603', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', '#1 Strip', 'VA', 'Abandoned', 'seed', true),
  ('4406661', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', '#2 Strip', 'VA', 'Abandoned', 'seed', true),
  ('4406662', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', '#3 Strip', 'VA', 'Abandoned', 'seed', true),
  ('4406743', '0e9e271b-e315-46bc-8c03-2a7ec085e129', 'Virginia Fuel Corporation', '0171761', 'Western Strip', 'VA', 'Abandoned', 'seed', true),
  ('4406771', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Strip No 3', 'VA', 'Abandoned', 'seed', true),
  ('4406808', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Bold Camp Strip', 'VA', 'Abandoned', 'seed', true),
  ('4406859', '4c65a05d-d906-4276-b8fc-68d42a51c8e8', 'Black River Coal LLC', '0171761', 'WAR CREEK NO. 1', 'VA', 'Abandoned and Sealed', 'seed', true),
  ('4406869', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Sigmon Strip #23', 'VA', 'Active', 'seed', true),
  ('4406888', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Strip #5', 'VA', 'Abandoned', 'seed', true),
  ('4406910', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Strip #6', 'VA', 'Abandoned', 'seed', true),
  ('4406934', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Lick Fork Strip', 'VA', 'Abandoned', 'seed', true),
  ('4406936', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Strip #7', 'VA', 'Abandoned', 'seed', true),
  ('4406947', '0e9e271b-e315-46bc-8c03-2a7ec085e129', 'Virginia Fuel Corporation', '0171761', 'Wilson Deep Mine #1', 'VA', 'Temporarily Idled', 'seed', true),
  ('4406948', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Strip #8', 'VA', 'Temporarily Idled', 'seed', true),
  ('4406972', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Fork Ridge Strip', 'VA', 'Abandoned', 'seed', true),
  ('4406981', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Strip #10', 'VA', 'Abandoned', 'seed', true),
  ('4406991', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Strip #11', 'VA', 'NonProducing', 'seed', true),
  ('4406992', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Strip #12', 'VA', 'Active', 'seed', true),
  ('4406999', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Strip #13', 'VA', 'Abandoned', 'seed', true),
  ('4407001', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Strip #14', 'VA', 'Temporarily Idled', 'seed', true),
  ('4407030', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Bull Run Strip', 'VA', 'Abandoned', 'seed', true),
  ('4407034', '0e9e271b-e315-46bc-8c03-2a7ec085e129', 'Virginia Fuel Corporation', '0171761', 'No 1 Strip', 'VA', 'Temporarily Idled', 'seed', true),
  ('4407066', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Powers Branch Strip #15', 'VA', 'Abandoned', 'seed', true),
  ('4407115', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Baden #1', 'VA', 'Temporarily Idled', 'seed', true),
  ('4407160', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Preacher Creek Strip', 'VA', 'Temporarily Idled', 'seed', true),
  ('4407188', 'e6ccdf47-ff6f-46e1-a40b-9757d8e9c1b2', 'Nine Mile Mining Inc.', '0171761', '#2', 'VA', 'Abandoned and Sealed', 'seed', true),
  ('4407201', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Job #15 Surface', 'VA', 'Abandoned', 'seed', true),
  ('4407228', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Mine No 1', 'VA', 'Abandoned', 'seed', true),
  ('4407238', '0e9e271b-e315-46bc-8c03-2a7ec085e129', 'Virginia Fuel Corporation', '0171761', 'VFC-Western Strip', 'VA', 'Abandoned', 'seed', true),
  ('4407246', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Strip #24', 'VA', 'Abandoned', 'seed', true),
  ('4407252', 'e6ccdf47-ff6f-46e1-a40b-9757d8e9c1b2', 'Nine Mile Mining Inc.', '0171761', 'Nine Mile #1', 'VA', 'Abandoned and Sealed', 'seed', true),
  ('4407253', '0e9e271b-e315-46bc-8c03-2a7ec085e129', 'Virginia Fuel Corporation', '0171761', 'Darby Road Mine #1', 'VA', 'Temporarily Idled', 'seed', true),
  ('4407275', '0e9e271b-e315-46bc-8c03-2a7ec085e129', 'Virginia Fuel Corporation', '0171761', 'Wilson #2 Mine', 'VA', 'Temporarily Idled', 'seed', true),
  ('4407276', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'Strip #26', 'VA', 'Temporarily Idled', 'seed', true),
  ('4407278', '0e9e271b-e315-46bc-8c03-2a7ec085e129', 'Virginia Fuel Corporation', '0171761', 'Virginia Fuel #3', 'VA', 'Abandoned', 'seed', true),
  ('4407283', '0e9e271b-e315-46bc-8c03-2a7ec085e129', 'Virginia Fuel Corporation', '0171761', 'Exeter Gob Pile', 'VA', 'Abandoned', 'seed', true),
  ('4407295', '0e9e271b-e315-46bc-8c03-2a7ec085e129', 'Virginia Fuel Corporation', '0171761', 'Wilson #3', 'VA', 'Abandoned', 'seed', true),
  ('4602380', '94394a52-0a40-4a37-bc02-d36a7762ffdd', 'Chestnut Land Holdings LLC', '0171761', 'Bishop Impoundment Area', 'WV', 'Active', 'seed', true),
  ('4608769', '5804f55b-4597-484e-b757-f3a31da4394f', 'Nufac Mining Company Inc.', '0171761', 'Buckeye Mine', 'WV', 'Abandoned', 'seed', true),
  ('4608786', '5804f55b-4597-484e-b757-f3a31da4394f', 'Nufac Mining Company Inc.', '0171761', 'No 57 Mine', 'WV', 'Temporarily Idled', 'seed', true),
  ('4608811', 'e04b9bd6-10da-4736-921e-24e55ec08381', 'Pay Car Mining Inc.', '0171761', 'Spider Ridge No. 1', 'WV', 'Abandoned and Sealed', 'seed', true),
  ('4608884', 'e04b9bd6-10da-4736-921e-24e55ec08381', 'Pay Car Mining Inc.', '0171761', 'No 58', 'WV', 'Temporarily Idled', 'seed', true),
  ('4608973', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'Kentucky Fuel Corporation', '0171761', 'WV-3 Surface Mine', 'WV', 'NonProducing', 'seed', true),
  ('4609021', 'e04b9bd6-10da-4736-921e-24e55ec08381', 'Pay Car Mining Inc.', '0171761', 'No 59 Mine', 'WV', 'Abandoned', 'seed', true),
  ('4609031', '389c1bb0-d42a-4ecf-bee2-c4b76d7f355d', 'Justice Highwall Mining Inc.', '0171761', 'No 2 Miner', 'WV', 'Temporarily Idled', 'seed', true),
  ('4609058', '9019b9c8-c21b-4698-afd9-c580e2007d32', 'Kentucky Fuel Corporation', '0171761', 'Salem #1', 'WV', 'Temporarily Idled', 'seed', true),
  ('4609123', '389c1bb0-d42a-4ecf-bee2-c4b76d7f355d', 'Justice Highwall Mining Inc.', '0171761', 'No 3 Miner', 'WV', 'Abandoned', 'seed', true),
  ('4609197', '389c1bb0-d42a-4ecf-bee2-c4b76d7f355d', 'Justice Highwall Mining Inc.', '0171761', 'Big Branch Highwall Mine', 'WV', 'Abandoned', 'seed', true),
  ('4609239', '389c1bb0-d42a-4ecf-bee2-c4b76d7f355d', 'Justice Highwall Mining Inc.', '0171761', 'No. 2 Contour & Auger', 'WV', 'NonProducing', 'seed', true),
  ('4609316', '5804f55b-4597-484e-b757-f3a31da4394f', 'Nufac Mining Company Inc.', '0171761', 'K-2 Plant', 'WV', 'Active', 'seed', true),
  ('4609366', '22635a0c-a2f2-4de4-9722-0c380e8dea9b', 'A & G Coal Corporation', '0171761', 'HWM System 23001', 'VA', 'Abandoned', 'seed', true),
  ('4609389', 'e04b9bd6-10da-4736-921e-24e55ec08381', 'Pay Car Mining Inc.', '0171761', 'Spider Ridge', 'WV', 'Abandoned', 'seed', true),
  ('4609458', '5d3266c4-d04c-47f2-ad25-c93e611be1ae', 'Newgate Development of Beckley LLC', '0171761', 'Three Marie Mine', 'WV', 'Abandoned', 'seed', true)
ON CONFLICT (mine_id) DO NOTHING;

CREATE OR REPLACE FUNCTION get_msha_map_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'active_mines', (SELECT count(*) FROM msha_mine_org_map WHERE is_active = true),
    'review_mines', (SELECT count(*) FROM msha_mine_review),
    'active_orgs', (SELECT count(DISTINCT organization_id) FROM msha_mine_org_map WHERE is_active = true),
    'last_refresh', (
      SELECT created_at FROM msha_map_drift_log
      WHERE run_type = 'refresh' ORDER BY created_at DESC LIMIT 1
    ),
    'last_reconcile', (
      SELECT created_at FROM msha_map_drift_log
      WHERE run_type = 'reconcile' ORDER BY created_at DESC LIMIT 1
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_msha_map_status() TO authenticated;

CREATE OR REPLACE FUNCTION get_msha_map_drift_latest()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'id', id,
        'run_type', run_type,
        'status', status,
        'summary', summary,
        'created_at', created_at
      )
      FROM msha_map_drift_log
      ORDER BY created_at DESC
      LIMIT 1
    ),
    '{}'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION get_msha_map_drift_latest() TO authenticated;

SELECT cron.unschedule('refresh-msha-mine-map-weekly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-msha-mine-map-weekly');

SELECT cron.schedule(
  'refresh-msha-mine-map-weekly',
  '30 4 * * 6',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/refresh-msha-mine-map',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('action', 'refresh', 'run_tag', 'cron-weekly-msha-map')
  );
  $$
);

SELECT cron.unschedule('reconcile-msha-mine-map-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-msha-mine-map-daily');

SELECT cron.schedule(
  'reconcile-msha-mine-map-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/refresh-msha-mine-map',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('action', 'reconcile', 'run_tag', 'cron-daily-msha-reconcile')
  );
  $$
);
