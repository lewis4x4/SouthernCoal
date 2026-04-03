import { useState, useMemo, useCallback } from 'react';
import { Satellite, Plus, MapPin, Trash2, Radio, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useWeatherStations } from '@/hooks/useWeatherStations';
import { usePermissions } from '@/hooks/usePermissions';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { WeatherStation, WeatherStationType, WeatherDataSource } from '@/types/weather';

const STATION_TYPE_LABELS: Record<WeatherStationType, string> = {
  noaa_asos: 'NOAA ASOS',
  noaa_coop: 'NOAA COOP',
  noaa_ghcnd: 'NOAA GHCND',
  site_gauge: 'Site Gauge',
};

const STATION_TYPE_BADGES: Record<WeatherStationType, string> = {
  noaa_asos: 'bg-sky-500/20 text-sky-400',
  noaa_coop: 'bg-indigo-500/20 text-indigo-400',
  noaa_ghcnd: 'bg-violet-500/20 text-violet-400',
  site_gauge: 'bg-emerald-500/20 text-emerald-400',
};

const DATA_SOURCE_LABELS: Record<WeatherDataSource, string> = {
  ncei_cdo: 'NCEI CDO API',
  nws_api: 'NWS API',
  manual_gauge: 'Manual Gauge',
  iot_gauge: 'IoT Gauge',
};

// ---------------------------------------------------------------------------
// Register Station Dialog
// ---------------------------------------------------------------------------

function RegisterStationDialog({
  isOpen,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<WeatherStation, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
}) {
  const { profile } = useUserProfile();
  const [form, setForm] = useState({
    station_id: '',
    station_name: '',
    station_type: 'noaa_asos' as WeatherStationType,
    latitude: '',
    longitude: '',
    elevation_ft: '',
    state_code: 'WV',
    data_source: 'ncei_cdo' as WeatherDataSource,
    api_endpoint: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const isValid = form.station_id.trim() && form.station_name.trim() && form.latitude && form.longitude;

  const handleSubmit = useCallback(async () => {
    if (!isValid || !profile?.organization_id) return;
    setSubmitting(true);
    try {
      await onSubmit({
        tenant_id: profile.organization_id,
        station_id: form.station_id.trim(),
        station_name: form.station_name.trim(),
        station_type: form.station_type,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        elevation_ft: form.elevation_ft ? parseFloat(form.elevation_ft) : null,
        state_code: form.state_code || null,
        data_source: form.data_source,
        api_endpoint: form.api_endpoint.trim() || null,
        is_active: true,
        notes: form.notes.trim() || null,
      });
      onClose();
    } catch {
      toast.error('Failed to register station');
    } finally {
      setSubmitting(false);
    }
  }, [isValid, form, profile?.organization_id, onSubmit, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-white/[0.08] bg-crystal-surface p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-text-primary">Register Weather Station</h2>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Station ID *</label>
              <input
                value={form.station_id}
                onChange={(e) => setForm((f) => ({ ...f, station_id: e.target.value }))}
                placeholder="GHCND:USW00013866"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-text-primary outline-none focus:border-sky-500/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Type *</label>
              <select
                value={form.station_type}
                onChange={(e) => setForm((f) => ({ ...f, station_type: e.target.value as WeatherStationType }))}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-text-primary outline-none focus:border-sky-500/50"
              >
                {Object.entries(STATION_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Station Name *</label>
            <input
              value={form.station_name}
              onChange={(e) => setForm((f) => ({ ...f, station_name: e.target.value }))}
              placeholder="Beckley Memorial Airport, WV"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-text-primary outline-none focus:border-sky-500/50"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Latitude *</label>
              <input
                type="number"
                step="0.000001"
                value={form.latitude}
                onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                placeholder="37.7878"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-text-primary outline-none focus:border-sky-500/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Longitude *</label>
              <input
                type="number"
                step="0.000001"
                value={form.longitude}
                onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                placeholder="-81.1242"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-text-primary outline-none focus:border-sky-500/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Elevation (ft)</label>
              <input
                type="number"
                value={form.elevation_ft}
                onChange={(e) => setForm((f) => ({ ...f, elevation_ft: e.target.value }))}
                placeholder="2504"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-text-primary outline-none focus:border-sky-500/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">State</label>
              <select
                value={form.state_code}
                onChange={(e) => setForm((f) => ({ ...f, state_code: e.target.value }))}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-text-primary outline-none focus:border-sky-500/50"
              >
                <option value="AL">Alabama</option>
                <option value="KY">Kentucky</option>
                <option value="TN">Tennessee</option>
                <option value="VA">Virginia</option>
                <option value="WV">West Virginia</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Data Source</label>
              <select
                value={form.data_source}
                onChange={(e) => setForm((f) => ({ ...f, data_source: e.target.value as WeatherDataSource }))}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-text-primary outline-none focus:border-sky-500/50"
              >
                {Object.entries(DATA_SOURCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Optional notes about this station..."
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-text-primary outline-none focus:border-sky-500/50"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-white/[0.08] px-4 py-2 text-sm text-text-secondary hover:bg-white/[0.04]">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Registering...' : 'Register Station'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function WeatherStationsPage() {
  const { getEffectiveRole } = usePermissions();
  const { stations, assignments, loading, createStation, deleteStation } = useWeatherStations();
  const [showRegister, setShowRegister] = useState(false);

  const role = getEffectiveRole();
  const isAdmin = role === 'admin';

  // Group assignments by site
  const stationAssignmentMap = useMemo(() => {
    const map = new Map<string, { site_id: string; is_primary: boolean }[]>();
    for (const a of assignments) {
      const list = map.get(a.weather_station_id) || [];
      list.push({ site_id: a.site_id, is_primary: a.is_primary });
      map.set(a.weather_station_id, list);
    }
    return map;
  }, [assignments]);

  const handleRegister = useCallback(
    async (data: Omit<WeatherStation, 'id' | 'created_at' | 'updated_at'>) => {
      const result = await createStation(data);
      if (result.error) throw new Error(result.error);
    },
    [createStation],
  );

  const handleDelete = useCallback(
    async (stationId: string, stationName: string) => {
      if (!confirm(`Delete station "${stationName}"? This cannot be undone.`)) return;
      const result = await deleteStation(stationId);
      if (result.error) toast.error(result.error);
    },
    [deleteStation],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg bg-gradient-to-br from-teal-600 to-teal-500 p-2.5">
            <Satellite className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Weather Stations</h1>
            <p className="text-sm text-text-muted">
              NOAA stations and site gauges for precipitation monitoring
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowRegister(true)}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500"
          >
            <Plus className="h-4 w-4" />
            Register Station
          </button>
        )}
      </div>

      {/* Station Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      ) : stations.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center backdrop-blur-xl">
          <Satellite className="mx-auto mb-3 h-10 w-10 text-text-muted" />
          <h3 className="mb-1 text-base font-medium text-text-secondary">No Weather Stations</h3>
          <p className="text-sm text-text-muted">
            Register NOAA weather stations to enable automated precipitation monitoring.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {stations.map((station) => {
            const siteAssignments = stationAssignmentMap.get(station.id) || [];
            const primaryCount = siteAssignments.filter((a) => a.is_primary).length;
            const totalSites = siteAssignments.length;

            return (
              <div
                key={station.id}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-crystal-surface/50 to-crystal-surface/20 p-5 backdrop-blur-xl transition-all hover:border-white/[0.12]"
              >
                {/* Status indicator */}
                <div className="absolute right-4 top-4">
                  {station.is_active ? (
                    <div className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
                      <CheckCircle className="h-3 w-3" />
                      Active
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
                      <AlertCircle className="h-3 w-3" />
                      Inactive
                    </div>
                  )}
                </div>

                {/* Station info */}
                <div className="mb-3 flex items-center gap-2">
                  <Radio className="h-4 w-4 text-teal-400" />
                  <h3 className="text-sm font-semibold text-text-primary">{station.station_name}</h3>
                </div>

                <div className="mb-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATION_TYPE_BADGES[station.station_type]}`}>
                      {STATION_TYPE_LABELS[station.station_type]}
                    </span>
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-text-muted">
                      {station.station_id}
                    </span>
                  </div>
                  <p className="flex items-center gap-1 text-xs text-text-muted">
                    <MapPin className="h-3 w-3" />
                    {station.latitude.toFixed(4)}, {station.longitude.toFixed(4)}
                    {station.state_code && ` — ${station.state_code}`}
                    {station.elevation_ft && ` — ${station.elevation_ft} ft`}
                  </p>
                  <p className="text-xs text-text-muted">
                    Source: {DATA_SOURCE_LABELS[station.data_source]}
                  </p>
                </div>

                {/* Site assignments summary */}
                <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                  <p className="text-xs text-text-muted">
                    {totalSites > 0 ? (
                      <>
                        {totalSites} site{totalSites !== 1 ? 's' : ''} assigned
                        {primaryCount > 0 && <span className="ml-1 text-teal-400">({primaryCount} primary)</span>}
                      </>
                    ) : (
                      <span className="text-amber-400">No sites assigned</span>
                    )}
                  </p>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(station.id, station.station_name)}
                      className="rounded-lg p-1.5 text-text-muted opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {station.notes && (
                  <p className="mt-2 text-xs italic text-text-muted">{station.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Register Dialog */}
      <RegisterStationDialog
        isOpen={showRegister}
        onClose={() => setShowRegister(false)}
        onSubmit={handleRegister}
      />
    </div>
  );
}

export default WeatherStationsPage;
