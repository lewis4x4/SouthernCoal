
-- Add limit_min and limit_max columns to permit_limits
-- Required by detect_exceedance() trigger on lab_results
-- Used for range-type limits (e.g., pH 6.0–9.0)
ALTER TABLE public.permit_limits
  ADD COLUMN IF NOT EXISTS limit_min numeric,
  ADD COLUMN IF NOT EXISTS limit_max numeric;

COMMENT ON COLUMN public.permit_limits.limit_min IS 'Minimum value for range-type limits (e.g., pH minimum 6.0)';
COMMENT ON COLUMN public.permit_limits.limit_max IS 'Maximum value for range-type limits (e.g., pH maximum 9.0)';
;
