-- Visual stream flow estimation (WV NPDES receiving-stream style monitoring).
-- Nullable: only populated for applicable stream points when condition is flowing discharge;
-- standing water sampleable uses flow_estimate_cfs = 0 with null category/method.

ALTER TABLE outlet_inspections
  ADD COLUMN IF NOT EXISTS flow_category text
    CHECK (flow_category IS NULL OR flow_category IN ('trickle', 'low', 'moderate', 'high', 'flood')),
  ADD COLUMN IF NOT EXISTS flow_estimate_cfs numeric,
  ADD COLUMN IF NOT EXISTS flow_method text
    CHECK (flow_method IS NULL OR flow_method IN ('visual', 'float', 'instrument')),
  ADD COLUMN IF NOT EXISTS flow_safety_warning_shown boolean;

COMMENT ON COLUMN outlet_inspections.flow_category IS 'Visual flow band; QA only — trickle/low/moderate/high/flood';
COMMENT ON COLUMN outlet_inspections.flow_estimate_cfs IS 'Reporter cfs estimate for DMR / quarterly stream monitoring';
COMMENT ON COLUMN outlet_inspections.flow_method IS 'visual | float | instrument';
COMMENT ON COLUMN outlet_inspections.flow_safety_warning_shown IS 'True when flood band selected and safety banner applies';
