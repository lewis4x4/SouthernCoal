-- Wire FK: sampling_events.precipitation_event_id → precipitation_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_sampling_events_precipitation_event'
      AND table_name = 'sampling_events'
  ) THEN
    ALTER TABLE sampling_events
      ADD CONSTRAINT fk_sampling_events_precipitation_event
      FOREIGN KEY (precipitation_event_id) REFERENCES precipitation_events(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Add rain_event_trigger JSONB column to sampling_schedules
ALTER TABLE sampling_schedules
  ADD COLUMN IF NOT EXISTS rain_event_trigger jsonb;

COMMENT ON COLUMN sampling_schedules.rain_event_trigger IS
  'Per-outfall rain event trigger config: rainfall_threshold_inches, trigger_window_hours, discharge_required, field_confirmation_required, max_sample_delay_hours, recurrence_interval_years';

-- Precipitation evidence storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'precipitation-evidence',
  'precipitation-evidence',
  false,
  26214400,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/tiff']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
CREATE POLICY precip_evidence_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'precipitation-evidence'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );

CREATE POLICY precip_evidence_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'precipitation-evidence'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
    AND current_user_has_any_role(ARRAY[
      'wv_supervisor', 'environmental_manager', 'site_manager', 'executive', 'admin'
    ])
  );

CREATE POLICY precip_evidence_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'precipitation-evidence'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
    AND current_user_has_any_role(ARRAY['admin'])
  );

-- Audit immutability trigger
CREATE OR REPLACE FUNCTION prevent_rain_event_audit_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.action IN (
    'rain_event_dismissed',
    'rain_event_activated',
    'rain_event_manual_declared',
    'rain_event_exemption_claimed',
    'rain_event_exemption_approved',
    'rain_event_exemption_denied'
  ) THEN
    RAISE EXCEPTION 'Cannot delete immutable rain event audit log entry (id: %, action: %)',
      OLD.id, OLD.action;
  END IF;
  RETURN OLD;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_rain_event_audit_delete'
  ) THEN
    CREATE TRIGGER trg_prevent_rain_event_audit_delete
      BEFORE DELETE ON audit_log
      FOR EACH ROW
      EXECUTE FUNCTION prevent_rain_event_audit_delete();
  END IF;
END $$;

-- Helper function: check rain event thresholds
CREATE OR REPLACE FUNCTION check_rain_event_thresholds(
  p_station_id uuid,
  p_reading_date date,
  p_rainfall_inches decimal
)
RETURNS TABLE (
  schedule_id uuid,
  outfall_id uuid,
  permit_id uuid,
  organization_id uuid,
  threshold_inches decimal,
  exceeded boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    ss.id AS schedule_id,
    ss.outfall_id,
    ss.permit_id,
    ss.organization_id,
    COALESCE(
      (ss.rain_event_trigger->>'rainfall_threshold_inches')::decimal,
      0.50
    ) AS threshold_inches,
    p_rainfall_inches >= COALESCE(
      (ss.rain_event_trigger->>'rainfall_threshold_inches')::decimal,
      0.50
    ) AS exceeded
  FROM sampling_schedules ss
  JOIN outfalls o ON o.id = ss.outfall_id
  JOIN npdes_permits np ON np.id = ss.permit_id
  JOIN sites s ON s.id = o.site_id
  JOIN site_weather_station_assignments swsa ON swsa.site_id = s.id
  WHERE swsa.weather_station_id = p_station_id
    AND ss.frequency_code = 'rain_event'
    AND ss.is_active = true;
$$;;
