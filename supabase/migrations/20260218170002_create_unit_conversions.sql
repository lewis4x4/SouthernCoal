-- =============================================================================
-- Migration 002: Create unit_conversions table for exceedance detection
-- =============================================================================
-- Purpose: Store conversion factors between units (e.g., µg/L → mg/L)
-- Used by: exceedance detection trigger to normalize lab results vs permit limits
-- =============================================================================

-- Create unit_conversions table
CREATE TABLE IF NOT EXISTS unit_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_id uuid REFERENCES parameters(id) ON DELETE CASCADE,
  from_unit text NOT NULL,
  to_unit text NOT NULL,
  conversion_factor numeric NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Unique constraint: one conversion per parameter + unit pair
  CONSTRAINT unit_conversions_unique UNIQUE (parameter_id, from_unit, to_unit)
);

-- Index for fast lookups during exceedance detection
CREATE INDEX idx_unit_conversions_lookup
ON unit_conversions (parameter_id, from_unit, to_unit);

-- RLS: Read-only for authenticated users
ALTER TABLE unit_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read unit conversions"
  ON unit_conversions FOR SELECT TO authenticated USING (true);

-- Documentation
COMMENT ON TABLE unit_conversions IS 'Unit conversion factors for normalizing lab results to permit limit units during exceedance detection';
COMMENT ON COLUMN unit_conversions.parameter_id IS 'Parameter this conversion applies to (NULL = applies to all parameters)';
COMMENT ON COLUMN unit_conversions.from_unit IS 'Source unit (lab result unit)';
COMMENT ON COLUMN unit_conversions.to_unit IS 'Target unit (permit limit unit)';
COMMENT ON COLUMN unit_conversions.conversion_factor IS 'Multiply by this factor to convert from_unit → to_unit';

-- =============================================================================
-- Seed common unit conversions
-- =============================================================================

-- Concentration conversions (universal)
INSERT INTO unit_conversions (parameter_id, from_unit, to_unit, conversion_factor, notes) VALUES
  -- µg/L to mg/L (micrograms to milligrams)
  (NULL, 'ug/L', 'mg/L', 0.001, 'Micrograms/L to Milligrams/L'),
  (NULL, 'µg/L', 'mg/L', 0.001, 'Micrograms/L to Milligrams/L (unicode µ)'),
  (NULL, 'ppb', 'ppm', 0.001, 'Parts per billion to parts per million'),
  (NULL, 'ppb', 'mg/L', 0.001, 'ppb ≈ µg/L → mg/L'),

  -- mg/L to µg/L (reverse)
  (NULL, 'mg/L', 'ug/L', 1000, 'Milligrams/L to Micrograms/L'),
  (NULL, 'mg/L', 'µg/L', 1000, 'Milligrams/L to Micrograms/L (unicode µ)'),
  (NULL, 'ppm', 'ppb', 1000, 'Parts per million to parts per billion'),

  -- Temperature conversions
  (NULL, 'F', 'C', 0.5556, 'Fahrenheit to Celsius: (F-32) × 5/9'),
  (NULL, '°F', '°C', 0.5556, 'Fahrenheit to Celsius (with degree symbol)'),

  -- Flow conversions
  (NULL, 'gpm', 'MGD', 0.00144, 'Gallons per minute to Million Gallons per Day'),
  (NULL, 'cfs', 'MGD', 0.6463, 'Cubic feet per second to Million Gallons per Day'),
  (NULL, 'GPD', 'MGD', 0.000001, 'Gallons per Day to Million Gallons per Day'),

  -- Mass conversions
  (NULL, 'lb/day', 'kg/day', 0.4536, 'Pounds per day to Kilograms per day'),
  (NULL, 'kg/day', 'lb/day', 2.2046, 'Kilograms per day to Pounds per day')
ON CONFLICT (parameter_id, from_unit, to_unit) DO NOTHING;
