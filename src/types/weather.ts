/**
 * Rain Event Monitoring Module — Type Definitions
 *
 * Tables:
 * - weather_stations (20260403950000)
 * - site_weather_station_assignments (20260403950000)
 * - precipitation_readings (20260403950000)
 * - precipitation_events (20260403950000)
 *
 * JSONB config:
 * - sampling_schedules.rain_event_trigger
 */

// ---------------------------------------------------------------------------
// Weather Stations
// ---------------------------------------------------------------------------

export type WeatherStationType = 'noaa_asos' | 'noaa_coop' | 'noaa_ghcnd' | 'site_gauge';

export type WeatherDataSource = 'ncei_cdo' | 'nws_api' | 'manual_gauge' | 'iot_gauge';

export interface WeatherStation {
  id: string;
  tenant_id: string;
  station_id: string;
  station_name: string;
  station_type: WeatherStationType;
  latitude: number;
  longitude: number;
  elevation_ft: number | null;
  state_code: string | null;
  data_source: WeatherDataSource;
  api_endpoint: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Site-to-Station Assignments
// ---------------------------------------------------------------------------

export interface SiteWeatherStationAssignment {
  id: string;
  site_id: string;
  weather_station_id: string;
  distance_miles: number | null;
  is_primary: boolean;
  assigned_by: string | null;
  assigned_at: string;
}

export interface SiteWeatherStationAssignmentWithStation extends SiteWeatherStationAssignment {
  weather_station: WeatherStation;
}

// ---------------------------------------------------------------------------
// Precipitation Readings
// ---------------------------------------------------------------------------

export type PrecipitationSourceType = 'api_automated' | 'manual_entry' | 'gauge_upload';

export interface PrecipitationReading {
  id: string;
  weather_station_id: string;
  reading_date: string;
  reading_time: string | null;
  rainfall_inches: number;
  duration_hours: number | null;
  data_quality_flag: string | null;
  source_type: PrecipitationSourceType;
  raw_api_response: Record<string, unknown> | null;
  fetched_at: string | null;
  created_at: string;
}

export interface PrecipitationReadingWithStation extends PrecipitationReading {
  weather_station: Pick<WeatherStation, 'station_id' | 'station_name' | 'station_type'>;
}

// ---------------------------------------------------------------------------
// Precipitation Events
// ---------------------------------------------------------------------------

export type PrecipitationTriggerSource = 'automated' | 'manual' | 'gauge_only' | 'radar';

export type PrecipitationEventStatus = 'alert_generated' | 'activated' | 'dismissed' | 'completed';

export type DismissReasonCode =
  | 'NO_DISCHARGE'
  | 'STATION_ERROR'
  | 'LOCALIZED_EVENT'
  | 'BELOW_ACTUAL'
  | 'OTHER';

export type ManualTriggerReasonCode =
  | 'GAUGE_ONLY'
  | 'VISUAL_DISCHARGE'
  | 'RADAR_INDICATED'
  | 'PERMIT_REQUIREMENT';

export interface PrecipitationEvent {
  id: string;
  organization_id: string;
  weather_station_id: string;
  precipitation_reading_id: string | null;
  event_date: string;
  rainfall_inches: number;
  trigger_source: PrecipitationTriggerSource;
  status: PrecipitationEventStatus;

  // Activation
  activated_by: string | null;
  activated_at: string | null;

  // Dismissal
  dismissed_by: string | null;
  dismissed_at: string | null;
  dismiss_reason_code: DismissReasonCode | null;
  dismiss_justification: string | null;

  // Manual declaration
  manual_trigger_reason_code: ManualTriggerReasonCode | null;
  manual_trigger_justification: string | null;
  supporting_evidence_ids: string[] | null;

  // Exemption
  recurrence_interval: number | null;

  created_at: string;
  updated_at: string;
}

export interface PrecipitationEventWithRelations extends PrecipitationEvent {
  weather_station: Pick<WeatherStation, 'station_id' | 'station_name' | 'station_type'>;
  activated_by_profile: { full_name: string; email: string } | null;
  dismissed_by_profile: { full_name: string; email: string } | null;
}

// ---------------------------------------------------------------------------
// Rain Event Trigger Config (JSONB on sampling_schedules)
// ---------------------------------------------------------------------------

export interface RainEventTriggerConfig {
  rainfall_threshold_inches: number;
  trigger_window_hours: number;
  discharge_required: boolean;
  field_confirmation_required: boolean;
  max_sample_delay_hours: number;
  recurrence_interval_years: number | null;
}

/** Default trigger config per appendix Section A.1 */
export const DEFAULT_RAIN_EVENT_TRIGGER: RainEventTriggerConfig = {
  rainfall_threshold_inches: 0.50,
  trigger_window_hours: 24,
  discharge_required: true,
  field_confirmation_required: true,
  max_sample_delay_hours: 24,
  recurrence_interval_years: null,
};

// ---------------------------------------------------------------------------
// Dismiss / Manual Declaration form values
// ---------------------------------------------------------------------------

export const DISMISS_REASON_OPTIONS: { code: DismissReasonCode; label: string; description: string }[] = [
  { code: 'NO_DISCHARGE', label: 'No Discharge', description: 'Field confirmed no discharge at outfall' },
  { code: 'STATION_ERROR', label: 'Station Error', description: 'Station data believed erroneous' },
  { code: 'LOCALIZED_EVENT', label: 'Localized Event', description: 'Rain at station did not affect site area' },
  { code: 'BELOW_ACTUAL', label: 'Below Actual', description: 'Site gauge shows rainfall below threshold' },
  { code: 'OTHER', label: 'Other', description: 'Free text required (minimum 50 characters)' },
];

export const MANUAL_TRIGGER_REASON_OPTIONS: { code: ManualTriggerReasonCode; label: string; description: string }[] = [
  { code: 'GAUGE_ONLY', label: 'Gauge Only', description: 'Site gauge exceeded threshold but NOAA station did not' },
  { code: 'VISUAL_DISCHARGE', label: 'Visual Discharge', description: 'Field personnel observed discharge during or after precipitation' },
  { code: 'RADAR_INDICATED', label: 'Radar Indicated', description: 'NWS radar shows significant precipitation over site area' },
  { code: 'PERMIT_REQUIREMENT', label: 'Permit Requirement', description: 'Permit language requires sampling under conditions not captured by automated thresholds' },
];

// ---------------------------------------------------------------------------
// Evidence Packet fields (Section E of appendix)
// ---------------------------------------------------------------------------

export interface EvidencePacketFields {
  source_station_ids: string[];
  station_names_and_types: string[];
  raw_data_pull_timestamp: string | null;
  rainfall_amount_inches: number;
  reading_date_time_window: string;
  data_quality_flags: string | null;
  confirmed_declared_by: string;
  confirmation_timestamp: string;
  affected_outfalls: string[];
  dispatch_timestamp: string | null;
  sampling_completion_per_outfall: Record<string, 'completed' | 'nodi' | 'missed'>;
  sample_collection_timestamps: string[];
  lab_results_received: boolean;
  exception_dismissal_notes: string | null;
  recurrence_interval: number | null;
  forty_eight_hr_sampling_proof: string[] | null;
  exemption_approval_chain: string[] | null;
}
