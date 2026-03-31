
-- Fix ON CONFLICT mismatch: expression index can't be referenced by column names
-- in Supabase JS client's upsert onConflict parameter.
-- Solution: Always store '00:00:00' for sample_time (never null) and use plain unique index.

-- First set default so any future inserts without time get '00:00:00'
ALTER TABLE public.sampling_events 
  ALTER COLUMN sample_time SET DEFAULT '00:00:00'::time;

-- Update any existing nulls (currently 0 rows, but safe)
UPDATE public.sampling_events 
  SET sample_time = '00:00:00'::time 
  WHERE sample_time IS NULL;

-- Drop expression index and recreate as plain column index
DROP INDEX IF EXISTS idx_sampling_events_unique_event;
CREATE UNIQUE INDEX idx_sampling_events_unique_event 
  ON public.sampling_events USING btree (outfall_id, sample_date, sample_time);
;
