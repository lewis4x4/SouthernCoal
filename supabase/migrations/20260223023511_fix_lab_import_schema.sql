
-- Fix 1: Make sampling_events.site_id nullable
-- Sites aren't populated yet; lab EDD imports derive outfall from permit, not site.
-- site_id can be backfilled later when sites are properly set up.
ALTER TABLE public.sampling_events ALTER COLUMN site_id DROP NOT NULL;

-- Fix 2: Add INSERT RLS policies for sampling_events and lab_results
-- Needed for import function and future direct inserts.
-- Service role bypasses RLS, but these are needed for non-service-role contexts.

CREATE POLICY "Users can insert own org sampling_events"
  ON public.sampling_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM outfalls o
      JOIN npdes_permits p ON o.permit_id = p.id
      JOIN user_profiles up ON up.organization_id = p.organization_id
      WHERE o.id = sampling_events.outfall_id
        AND up.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own org lab_results"
  ON public.lab_results
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sampling_events se
      JOIN outfalls o ON se.outfall_id = o.id
      JOIN npdes_permits p ON o.permit_id = p.id
      JOIN user_profiles up ON up.organization_id = p.organization_id
      WHERE se.id = lab_results.sampling_event_id
        AND up.id = auth.uid()
    )
  );
;
