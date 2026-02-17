-- =============================================================================
-- Migration 003: Add missing STORET codes and new parameters
-- =============================================================================
-- Updates existing parameters with missing STORET codes
-- Adds new parameters commonly found in WV/KY/TN/VA permit data
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Update existing parameters with missing STORET codes
-- ---------------------------------------------------------------------------

UPDATE parameters SET storet_code = '01046'
  WHERE name = 'Iron, Dissolved' AND storet_code IS NULL;

UPDATE parameters SET storet_code = '01056'
  WHERE name = 'Manganese, Dissolved' AND storet_code IS NULL;

UPDATE parameters SET storet_code = '00010'
  WHERE name = 'Temperature' AND storet_code IS NULL;

UPDATE parameters SET storet_code = '00076'
  WHERE name = 'Turbidity' AND storet_code IS NULL;

UPDATE parameters SET storet_code = '00300'
  WHERE name = 'Dissolved Oxygen' AND storet_code IS NULL;

UPDATE parameters SET storet_code = '00940'
  WHERE name = 'Chloride' AND storet_code IS NULL;

-- ---------------------------------------------------------------------------
-- Add new parameters commonly found in coal mining permits
-- ---------------------------------------------------------------------------

INSERT INTO parameters (name, short_name, storet_code, category, default_unit, fraction)
VALUES
  -- Settleable Solids (commonly required in WV permits)
  ('Settleable Solids', 'Sett', '00545', 'physical', 'mL/L', 'total'),

  -- Acidity (coal mine drainage parameter)
  ('Acidity', 'Acid', '00435', 'physical', 'mg/L CaCO3', 'total'),

  -- Alkalinity (coal mine drainage parameter)
  ('Alkalinity', 'Alk', '00410', 'physical', 'mg/L CaCO3', 'total'),

  -- Oil & Grease (industrial parameter - Pinnacle WV0090000)
  ('Oil & Grease', 'O&G', '00556', 'physical', 'mg/L', 'total'),

  -- Osmotic Pressure (WV-specific parameter)
  ('Osmotic Pressure', 'OP', '71897', 'physical', 'mOsm/kg', 'total'),

  -- Hardness (water quality parameter)
  ('Hardness', 'Hard', '00900', 'physical', 'mg/L CaCO3', 'total'),

  -- BOD (industrial parameter - Pinnacle WV0090000)
  ('BOD', 'BOD5', '00310', 'physical', 'mg/L', 'total'),

  -- Ammonia (nutrient parameter)
  ('Ammonia', 'NH3-N', '00610', 'nutrient', 'mg/L', 'total'),

  -- Calcium (water chemistry)
  ('Calcium', 'Ca', '00916', 'metal', 'mg/L', 'total'),

  -- Magnesium (water chemistry)
  ('Magnesium', 'Mg', '00927', 'metal', 'mg/L', 'total'),

  -- Sodium (water chemistry)
  ('Sodium', 'Na', '00929', 'metal', 'mg/L', 'total'),

  -- Potassium (water chemistry)
  ('Potassium', 'K', '00937', 'metal', 'mg/L', 'total'),

  -- Aluminum, Dissolved (needed for KY/VA permits)
  ('Aluminum, Dissolved', 'Al-D', '01106', 'metal', 'mg/L', 'dissolved'),

  -- Selenium, Dissolved (needed for selenium limits)
  ('Selenium, Dissolved', 'Se-D', '01147', 'metal', 'ug/L', 'dissolved'),

  -- Flow, Instantaneous (different from daily average Flow)
  ('Flow, Instantaneous', 'Q-Inst', '00061', 'physical', 'cfs', 'total')

ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Document the update
-- ---------------------------------------------------------------------------
COMMENT ON TABLE parameters IS
  'Master parameter reference with STORET codes. Updated 2026-02-17 with dissolved metal codes and common coal mining parameters.';
