CREATE TABLE IF NOT EXISTS precipitation_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weather_station_id uuid NOT NULL REFERENCES weather_stations(id) ON DELETE CASCADE,
  reading_date date NOT NULL,
  reading_time time,
  rainfall_inches decimal(5,2) NOT NULL,
  duration_hours decimal(4,1),
  data_quality_flag text,
  source_type text NOT NULL
    CHECK (source_type IN ('api_automated', 'manual_entry', 'gauge_upload')),
  raw_api_response jsonb,
  fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(weather_station_id, reading_date, reading_time)
);

CREATE INDEX IF NOT EXISTS idx_precip_readings_station_date
  ON precipitation_readings(weather_station_id, reading_date);
CREATE INDEX IF NOT EXISTS idx_precip_readings_date
  ON precipitation_readings(reading_date DESC);

ALTER TABLE precipitation_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY precip_readings_select ON precipitation_readings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM weather_stations ws
      WHERE ws.id = precipitation_readings.weather_station_id
        AND ws.tenant_id IN (
          SELECT tenant_id FROM organizations WHERE id = get_user_org_id()
        )
    )
  );

CREATE POLICY precip_readings_insert ON precipitation_readings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM weather_stations ws
      WHERE ws.id = precipitation_readings.weather_station_id
        AND ws.tenant_id IN (
          SELECT tenant_id FROM organizations WHERE id = get_user_org_id()
        )
    )
    AND current_user_has_any_role(ARRAY['wv_supervisor', 'environmental_manager', 'field_sampler', 'float_sampler', 'admin'])
  );;
