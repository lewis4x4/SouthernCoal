import { useMemo } from 'react';
import type { PrecipitationReading, WeatherStation } from '@/types/weather';

// ---------------------------------------------------------------------------
// Source type badge config
// ---------------------------------------------------------------------------

const SOURCE_BADGE: Record<
  PrecipitationReading['source_type'],
  { label: string; className: string }
> = {
  api_automated: {
    label: 'API / Automated',
    className: 'bg-sky-500/20 text-sky-400',
  },
  manual_entry: {
    label: 'Manual Entry',
    className: 'bg-amber-500/20 text-amber-400',
  },
  gauge_upload: {
    label: 'Gauge Upload',
    className: 'bg-emerald-500/20 text-emerald-400',
  },
};

// ---------------------------------------------------------------------------
// Quality flag badge config
// ---------------------------------------------------------------------------

function qualityFlagBadge(flag: string | null) {
  if (!flag) return null;

  const map: Record<string, { className: string }> = {
    STATION_DATA_GAP: { className: 'bg-red-500/20 text-red-400' },
    STALE: { className: 'bg-amber-500/20 text-amber-400' },
    NO_DATA: { className: 'bg-red-500/20 text-red-400' },
    ESTIMATED: { className: 'bg-purple-500/20 text-purple-400' },
    ACCUMULATED: { className: 'bg-cyan-500/20 text-cyan-400' },
  };

  const style = map[flag] ?? { className: 'bg-white/[0.06] text-text-secondary' };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${style.className}`}
    >
      {flag.replace(/_/g, ' ')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReadingsTableProps {
  readings: PrecipitationReading[];
  stations: WeatherStation[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReadingsTable({ readings, stations }: ReadingsTableProps) {
  // Build station lookup
  const stationMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stations) {
      m.set(s.id, s.station_name);
    }
    return m;
  }, [stations]);

  // Sort by date descending
  const sorted = useMemo(
    () =>
      [...readings].sort(
        (a, b) => b.reading_date.localeCompare(a.reading_date),
      ),
    [readings],
  );

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-text-muted text-sm">
        No precipitation readings to display.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">
              Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">
              Station
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">
              Rainfall (in)
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">
              Duration (hrs)
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">
              Source
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">
              Quality Flag
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const badge = SOURCE_BADGE[r.source_type];
            return (
              <tr
                key={r.id}
                className="border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors"
              >
                <td className="px-4 py-3 text-text-primary font-mono text-xs whitespace-nowrap">
                  {r.reading_date}
                  {r.reading_time ? (
                    <span className="ml-1.5 text-text-muted">{r.reading_time}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-text-primary">
                  {stationMap.get(r.weather_station_id) ?? 'Unknown'}
                </td>
                <td className="px-4 py-3 text-right text-text-primary font-mono">
                  {r.rainfall_inches.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right text-text-primary font-mono">
                  {r.duration_hours != null ? r.duration_hours.toFixed(1) : '--'}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {qualityFlagBadge(r.data_quality_flag)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default ReadingsTable;
