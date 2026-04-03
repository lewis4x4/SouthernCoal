CREATE TABLE IF NOT EXISTS weather_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  station_id text NOT NULL,
  station_name text NOT NULL,
  station_type text NOT NULL
    CHECK (station_type IN ('noaa_asos', 'noaa_coop', 'noaa_ghcnd', 'site_gauge')),
  latitude decimal(9,6) NOT NULL,
  longitude decimal(9,6) NOT NULL,
  elevation_ft decimal(7,1),
  state_code text REFERENCES states(code),
  data_source text NOT NULL
    CHECK (data_source IN ('ncei_cdo', 'nws_api', 'manual_gauge', 'iot_gauge')),
  api_endpoint text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weather_stations_tenant_active
  ON weather_stations(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_weather_stations_state
  ON weather_stations(state_code) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS uq_weather_stations_tenant_station_id
  ON weather_stations(tenant_id, station_id);

CREATE TRIGGER set_weather_stations_updated_at
  BEFORE UPDATE ON weather_stations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE weather_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY weather_stations_select ON weather_stations
  FOR SELECT USING (tenant_id IN (
    SELECT tenant_id FROM organizations WHERE id = get_user_org_id()
  ));

CREATE POLICY weather_stations_insert ON weather_stations
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM organizations WHERE id = get_user_org_id()
    )
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE POLICY weather_stations_update ON weather_stations
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM organizations WHERE id = get_user_org_id()
    )
    AND current_user_has_any_role(ARRAY['environmental_manager', 'admin'])
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM organizations WHERE id = get_user_org_id()
    )
  );

CREATE POLICY weather_stations_delete ON weather_stations
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM organizations WHERE id = get_user_org_id()
    )
    AND current_user_has_any_role(ARRAY['admin'])
  );;
