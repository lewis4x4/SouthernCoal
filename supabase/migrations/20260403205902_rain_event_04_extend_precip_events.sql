-- Extend existing precipitation_events table with rain event module columns
-- Existing: id, site_id, event_start, event_end, rainfall_inches, recurrence_interval (text),
--           weather_station (text), data_source (text), exemption_*, notes, created_at, updated_at
-- Adding: organization_id, weather_station_id (FK), precipitation_reading_id (FK),
--         trigger_source, status, activation/dismissal/manual-declaration fields

ALTER TABLE precipitation_events
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS weather_station_id uuid REFERENCES weather_stations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS precipitation_reading_id uuid REFERENCES precipitation_readings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trigger_source text DEFAULT 'automated'
    CHECK (trigger_source IN ('automated', 'manual', 'gauge_only', 'radar')),
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'alert_generated'
    CHECK (status IN ('alert_generated', 'activated', 'dismissed', 'completed')),
  ADD COLUMN IF NOT EXISTS activated_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dismiss_reason_code text
    CHECK (dismiss_reason_code IS NULL OR dismiss_reason_code IN (
      'NO_DISCHARGE', 'STATION_ERROR', 'LOCALIZED_EVENT', 'BELOW_ACTUAL', 'OTHER'
    )),
  ADD COLUMN IF NOT EXISTS dismiss_justification text,
  ADD COLUMN IF NOT EXISTS manual_trigger_reason_code text
    CHECK (manual_trigger_reason_code IS NULL OR manual_trigger_reason_code IN (
      'GAUGE_ONLY', 'VISUAL_DISCHARGE', 'RADAR_INDICATED', 'PERMIT_REQUIREMENT'
    )),
  ADD COLUMN IF NOT EXISTS manual_trigger_justification text,
  ADD COLUMN IF NOT EXISTS supporting_evidence_ids uuid[];

-- Backfill organization_id from site_id for any existing rows
UPDATE precipitation_events pe
SET organization_id = s.organization_id
FROM sites s
WHERE s.id = pe.site_id
  AND pe.organization_id IS NULL;

-- Add CHECK constraints for justification length
ALTER TABLE precipitation_events
  ADD CONSTRAINT chk_dismiss_justification_length
    CHECK (
      dismiss_reason_code IS NULL
      OR (dismiss_justification IS NOT NULL AND length(trim(dismiss_justification)) >= 50)
    );

ALTER TABLE precipitation_events
  ADD CONSTRAINT chk_manual_trigger_justification_length
    CHECK (
      manual_trigger_reason_code IS NULL
      OR (manual_trigger_justification IS NOT NULL AND length(trim(manual_trigger_justification)) >= 50)
    );

-- Indexes on new columns
CREATE INDEX IF NOT EXISTS idx_precip_events_org_date_status
  ON precipitation_events(organization_id, event_start DESC, status);
CREATE INDEX IF NOT EXISTS idx_precip_events_station_id
  ON precipitation_events(weather_station_id, event_start DESC);
CREATE INDEX IF NOT EXISTS idx_precip_events_status
  ON precipitation_events(status) WHERE status = 'alert_generated';

-- set_updated_at trigger if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_precipitation_events_updated_at'
  ) THEN
    CREATE TRIGGER set_precipitation_events_updated_at
      BEFORE UPDATE ON precipitation_events
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- RLS (enable if not already)
ALTER TABLE precipitation_events ENABLE ROW LEVEL SECURITY;

-- RLS policies — use site_id for backward compat, organization_id for new module
CREATE POLICY precip_events_select ON precipitation_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sites s
      WHERE s.id = precipitation_events.site_id
        AND s.organization_id = get_user_org_id()
    )
    OR organization_id = get_user_org_id()
  );

CREATE POLICY precip_events_insert ON precipitation_events
  FOR INSERT WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM sites s
        WHERE s.id = precipitation_events.site_id
          AND s.organization_id = get_user_org_id()
      )
      OR organization_id = get_user_org_id()
    )
    AND current_user_has_any_role(ARRAY[
      'wv_supervisor', 'environmental_manager', 'site_manager', 'admin'
    ])
  );

CREATE POLICY precip_events_update ON precipitation_events
  FOR UPDATE USING (
    (
      EXISTS (
        SELECT 1 FROM sites s
        WHERE s.id = precipitation_events.site_id
          AND s.organization_id = get_user_org_id()
      )
      OR organization_id = get_user_org_id()
    )
    AND current_user_has_any_role(ARRAY[
      'wv_supervisor', 'environmental_manager', 'site_manager', 'admin'
    ])
  );;
