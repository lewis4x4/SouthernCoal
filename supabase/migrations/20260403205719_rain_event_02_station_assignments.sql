CREATE TABLE IF NOT EXISTS site_weather_station_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  weather_station_id uuid NOT NULL REFERENCES weather_stations(id) ON DELETE CASCADE,
  distance_miles decimal(5,1),
  is_primary boolean NOT NULL DEFAULT false,
  assigned_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, weather_station_id)
);

CREATE INDEX IF NOT EXISTS idx_swsa_site_primary
  ON site_weather_station_assignments(site_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_swsa_station
  ON site_weather_station_assignments(weather_station_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_swsa_site_primary
  ON site_weather_station_assignments(site_id)
  WHERE is_primary = true;

ALTER TABLE site_weather_station_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY swsa_select ON site_weather_station_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sites s
      WHERE s.id = site_weather_station_assignments.site_id
        AND s.organization_id = get_user_org_id()
    )
  );

CREATE POLICY swsa_insert ON site_weather_station_assignments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sites s
      WHERE s.id = site_weather_station_assignments.site_id
        AND s.organization_id = get_user_org_id()
    )
    AND current_user_has_any_role(ARRAY['environmental_manager', 'admin'])
  );

CREATE POLICY swsa_update ON site_weather_station_assignments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM sites s
      WHERE s.id = site_weather_station_assignments.site_id
        AND s.organization_id = get_user_org_id()
    )
    AND current_user_has_any_role(ARRAY['environmental_manager', 'admin'])
  );

CREATE POLICY swsa_delete ON site_weather_station_assignments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM sites s
      WHERE s.id = site_weather_station_assignments.site_id
        AND s.organization_id = get_user_org_id()
    )
    AND current_user_has_any_role(ARRAY['environmental_manager', 'admin'])
  );;
