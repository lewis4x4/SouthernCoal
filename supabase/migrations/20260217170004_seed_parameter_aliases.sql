-- =============================================================================
-- Migration 004: Seed parameter aliases
-- =============================================================================
-- Maps all 80+ lab/permit parameter name variants to canonical parameter IDs
-- Based on PARAMETER_MAP from parse-lab-data-edd Edge Function
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Iron variants → Iron, Total
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('fe_tot'),
  ('iron'),
  ('iron (total)'),
  ('iron, total'),
  ('iron, total rec'),
  ('iron total'),
  ('iron, total recoverable'),
  ('iron_total'),
  ('fe total'),
  ('fe, total')
) AS a(alias)
WHERE p.name = 'Iron, Total'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Iron, Dissolved variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('fe_dis'),
  ('iron (dissolved)'),
  ('iron, dissolved'),
  ('iron, dis'),
  ('iron dissolved'),
  ('fe dissolved')
) AS a(alias)
WHERE p.name = 'Iron, Dissolved'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Manganese variants → Manganese, Total
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('mn_tot'),
  ('manganese'),
  ('manganese (total)'),
  ('manganese, total'),
  ('manganese, tot rec'),
  ('manganese, total rec'),
  ('manganese, total recoverable'),
  ('manganese total'),
  ('mn total'),
  ('mn, total')
) AS a(alias)
WHERE p.name = 'Manganese, Total'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Manganese, Dissolved variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('mn_dis'),
  ('manganese (dissolved)'),
  ('manganese, dissolved'),
  ('manganese, dis'),
  ('manganese dissolved'),
  ('mn dissolved')
) AS a(alias)
WHERE p.name = 'Manganese, Dissolved'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- pH variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('ph'),
  ('ph_fld'),
  ('ph, field'),
  ('ph field'),
  ('ph_lab'),
  ('ph, lab'),
  ('ph lab'),
  ('hydrogen ion')
) AS a(alias)
WHERE p.name = 'pH'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Total Suspended Solids variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('tss'),
  ('total suspended solids'),
  ('suspended solids, total'),
  ('suspended solids'),
  ('tss_tot'),
  ('solids, suspended total')
) AS a(alias)
WHERE p.name = 'Total Suspended Solids'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Selenium, Total variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('se_tot'),
  ('selenium'),
  ('selenium (total)'),
  ('selenium, total'),
  ('selenium, total recoverable'),
  ('selenium total'),
  ('se total'),
  ('se, total')
) AS a(alias)
WHERE p.name = 'Selenium, Total'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Selenium, Dissolved variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('se_dis'),
  ('selenium (dissolved)'),
  ('selenium, dissolved'),
  ('selenium dissolved'),
  ('se dissolved')
) AS a(alias)
WHERE p.name = 'Selenium, Dissolved'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Specific Conductance variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('cond_lab'),
  ('conductivity'),
  ('specific conductance'),
  ('spec_cond'),
  ('conductance'),
  ('conductivity, specific'),
  ('sp cond'),
  ('spc')
) AS a(alias)
WHERE p.name = 'Specific Conductance'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sulfate variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('so4_tot'),
  ('so4'),
  ('sulfate'),
  ('sulfate (total)'),
  ('sulfate, total'),
  ('sulfate total'),
  ('sulphate')
) AS a(alias)
WHERE p.name = 'Sulfate'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Settleable Solids variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('setlsoltot'),
  ('settleable solids'),
  ('total settlable solids'),
  ('total settleable solids'),
  ('sett sol'),
  ('settl solids')
) AS a(alias)
WHERE p.name = 'Settleable Solids'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Aluminum, Total variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('al_tot'),
  ('aluminum'),
  ('aluminum (total)'),
  ('aluminum, total'),
  ('aluminum, tot rec'),
  ('aluminum, total recoverable'),
  ('aluminum total'),
  ('al total'),
  ('al, total'),
  ('aluminium')
) AS a(alias)
WHERE p.name = 'Aluminum, Total'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Aluminum, Dissolved variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('al_dis'),
  ('aluminum (dissolved)'),
  ('aluminum, dissolved'),
  ('aluminum dissolved'),
  ('al dissolved')
) AS a(alias)
WHERE p.name = 'Aluminum, Dissolved'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Total Dissolved Solids variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('tds'),
  ('total dissolved solids'),
  ('solids, total dissolved'),
  ('dissolved solids'),
  ('tds_tot')
) AS a(alias)
WHERE p.name = 'Total Dissolved Solids'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Temperature variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('temp'),
  ('temperature'),
  ('temperature, water'),
  ('water temp'),
  ('temp_fld'),
  ('temperature field')
) AS a(alias)
WHERE p.name = 'Temperature'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Flow variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('flow'),
  ('flow_rate'),
  ('flow rate'),
  ('discharge'),
  ('effluent flow')
) AS a(alias)
WHERE p.name = 'Flow'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Mercury, Total variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('mercury'),
  ('mercury, total (as hg)'),
  ('mercury (total)'),
  ('mercury, total'),
  ('hg'),
  ('hg_tot')
) AS a(alias)
WHERE p.name = 'Mercury, Total'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Dissolved Oxygen variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('do'),
  ('do_fld'),
  ('dissolved oxygen'),
  ('oxygen, dissolved'),
  ('d.o.'),
  ('do field')
) AS a(alias)
WHERE p.name = 'Dissolved Oxygen'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Turbidity variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('turb'),
  ('turbidity'),
  ('turbidity, water')
) AS a(alias)
WHERE p.name = 'Turbidity'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Oil & Grease variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('o&g'),
  ('oil & grease'),
  ('oil and grease'),
  ('oil/grease'),
  ('og')
) AS a(alias)
WHERE p.name = 'Oil & Grease'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Alkalinity variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('alkalinity'),
  ('alkalinity, total'),
  ('alk'),
  ('total alkalinity'),
  ('alkalinity total')
) AS a(alias)
WHERE p.name = 'Alkalinity'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Hardness variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('hardness'),
  ('hardness, total'),
  ('total hardness'),
  ('hardness (total)'),
  ('hard')
) AS a(alias)
WHERE p.name = 'Hardness'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Acidity variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('acidity'),
  ('acidity, total'),
  ('total acidity'),
  ('acid')
) AS a(alias)
WHERE p.name = 'Acidity'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- BOD variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('bod'),
  ('bod5'),
  ('biochemical oxygen demand'),
  ('bod, 5-day'),
  ('bod 5 day')
) AS a(alias)
WHERE p.name = 'BOD'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Ammonia variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('nh3'),
  ('ammonia'),
  ('ammonia nitrogen'),
  ('ammonia-n'),
  ('nh3-n'),
  ('ammonia as n')
) AS a(alias)
WHERE p.name = 'Ammonia'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Calcium variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('calcium'),
  ('calcium (total)'),
  ('calcium, total'),
  ('ca'),
  ('ca_tot')
) AS a(alias)
WHERE p.name = 'Calcium'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Magnesium variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('magnesium'),
  ('magnesium (total)'),
  ('magnesium, total'),
  ('mg_tot'),
  ('mg total')
) AS a(alias)
WHERE p.name = 'Magnesium'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sodium variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('sodium'),
  ('sodium (total)'),
  ('sodium, total'),
  ('na'),
  ('na_tot')
) AS a(alias)
WHERE p.name = 'Sodium'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Potassium variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('potassium'),
  ('potassium (total)'),
  ('potassium, total'),
  ('k'),
  ('k_tot')
) AS a(alias)
WHERE p.name = 'Potassium'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Osmotic Pressure variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('osmotic pressure'),
  ('osmotic'),
  ('os press'),
  ('osmolality')
) AS a(alias)
WHERE p.name = 'Osmotic Pressure'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Chloride variants
-- ---------------------------------------------------------------------------
INSERT INTO parameter_aliases (parameter_id, alias, source)
SELECT p.id, a.alias, 'lab_edd'
FROM parameters p
CROSS JOIN (VALUES
  ('cl'),
  ('chloride'),
  ('chloride, total'),
  ('chlorides'),
  ('cl_tot')
) AS a(alias)
WHERE p.name = 'Chloride'
ON CONFLICT (alias, state_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Log the seed
-- ---------------------------------------------------------------------------
COMMENT ON TABLE parameter_aliases IS
  'Maps lab/permit parameter name variants to canonical parameters.id. Seeded 2026-02-17 with 80+ lab EDD variants.';
