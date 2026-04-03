import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import { cn } from '@/lib/cn';
import type { PrecipitationReading, PrecipitationSourceType } from '@/types/weather';
import type { WeatherStation } from '@/types/weather';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_COLORS: Record<PrecipitationSourceType, string> = {
  api_automated: '#0ea5e9', // sky-500
  manual_entry: '#f59e0b',  // amber-500
  gauge_upload: '#10b981',  // emerald-500
};

const SOURCE_LABELS: Record<PrecipitationSourceType, string> = {
  api_automated: 'API / Automated',
  manual_entry: 'Manual Entry',
  gauge_upload: 'Gauge Upload',
};

type DateRange = '7d' | '30d' | '90d' | 'custom';

interface PrecipitationChartProps {
  readings: PrecipitationReading[];
  stations: WeatherStation[];
  selectedStationId?: string;
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;

  const entry = payload[0]?.payload as {
    date: string;
    rainfall_inches: number;
    source_type: PrecipitationSourceType;
    station_name: string;
    data_quality_flag: string | null;
  } | undefined;

  if (!entry) return null;

  return (
    <div className="rounded-lg border border-white/[0.08] bg-surface-glass/95 backdrop-blur-xl p-3 shadow-lg text-xs space-y-1">
      <p className="font-medium text-text-primary">{entry.date}</p>
      <p className="text-text-secondary">
        Rainfall:{' '}
        <span className="font-mono text-text-primary">{entry.rainfall_inches.toFixed(2)} in</span>
      </p>
      <p className="text-text-secondary">
        Source:{' '}
        <span
          className="font-medium"
          style={{ color: SOURCE_COLORS[entry.source_type] }}
        >
          {SOURCE_LABELS[entry.source_type]}
        </span>
      </p>
      <p className="text-text-secondary">Station: {entry.station_name}</p>
      {entry.data_quality_flag && (
        <p className="text-amber-400">Flag: {entry.data_quality_flag}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PrecipitationChart({
  readings,
  stations,
  selectedStationId,
}: PrecipitationChartProps) {
  const [range, setRange] = useState<DateRange>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Build station lookup
  const stationMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stations) {
      m.set(s.id, s.station_name);
    }
    return m;
  }, [stations]);

  // Filter and shape data
  const chartData = useMemo(() => {
    const now = new Date();
    let cutoff: Date;

    if (range === 'custom' && customFrom) {
      cutoff = new Date(customFrom);
    } else {
      const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
      cutoff = new Date(now.getTime() - days * 86_400_000);
    }

    const endDate = range === 'custom' && customTo ? new Date(customTo) : now;

    return readings
      .filter((r) => {
        const d = new Date(r.reading_date);
        if (d < cutoff || d > endDate) return false;
        if (selectedStationId && r.weather_station_id !== selectedStationId) return false;
        return true;
      })
      .map((r) => ({
        date: r.reading_date,
        rainfall_inches: r.rainfall_inches,
        source_type: r.source_type,
        station_name: stationMap.get(r.weather_station_id) ?? 'Unknown',
        data_quality_flag: r.data_quality_flag,
        fill: SOURCE_COLORS[r.source_type],
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [readings, range, customFrom, customTo, selectedStationId, stationMap]);

  // Detect gaps — find dates with no reading between first & last
  const gapDates = useMemo(() => {
    if (chartData.length < 2) return new Set<string>();

    const dateSet = new Set(chartData.map((d) => d.date));
    const gaps = new Set<string>();

    const start = new Date(chartData[0]!.date);
    const end = new Date(chartData[chartData.length - 1]!.date);

    const cursor = new Date(start);
    while (cursor <= end) {
      const iso = cursor.toISOString().slice(0, 10);
      if (!dateSet.has(iso)) {
        gaps.add(iso);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return gaps;
  }, [chartData]);

  // Inject gap markers into chart data
  const dataWithGaps = useMemo(() => {
    if (gapDates.size === 0) return chartData;

    const merged = [...chartData];
    for (const gap of gapDates) {
      merged.push({
        date: gap,
        rainfall_inches: 0,
        source_type: 'api_automated' as PrecipitationSourceType,
        station_name: '',
        data_quality_flag: 'NO_DATA',
        fill: '#ef4444', // red-500 for gap indicator
      });
    }
    return merged.sort((a, b) => a.date.localeCompare(b.date));
  }, [chartData, gapDates]);

  const rangeButtons: { value: DateRange; label: string }[] = [
    { value: '7d', label: '7D' },
    { value: '30d', label: '30D' },
    { value: '90d', label: '90D' },
    { value: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-4">
      {/* Range Selector */}
      <div className="flex flex-wrap items-center gap-2">
        {rangeButtons.map((btn) => (
          <button
            key={btn.value}
            onClick={() => setRange(btn.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              range === btn.value
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'bg-white/[0.04] text-text-muted border border-white/[0.06] hover:bg-white/[0.08]',
            )}
          >
            {btn.label}
          </button>
        ))}

        {range === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-2 py-1 text-xs text-text-primary"
            />
            <span className="text-text-muted text-xs">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-2 py-1 text-xs text-text-primary"
            />
          </div>
        )}
      </div>

      {/* Chart */}
      {dataWithGaps.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-text-muted text-sm">
          No precipitation readings for the selected period.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={dataWithGaps} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              tickFormatter={(v: string) => {
                const d = new Date(v + 'T00:00:00');
                return `${d.getMonth() + 1}/${d.getDate()}`;
              }}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              label={{
                value: 'Rainfall (in)',
                angle: -90,
                position: 'insideLeft',
                style: { fill: 'rgba(255,255,255,0.45)', fontSize: 11 },
              }}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend
              formatter={(value: string) => (
                <span className="text-text-secondary text-xs">{value}</span>
              )}
            />
            <Bar dataKey="rainfall_inches" name="Rainfall (in)" radius={[4, 4, 0, 0]}>
              {dataWithGaps.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.data_quality_flag === 'NO_DATA' ? '#ef4444' : entry.fill}
                  fillOpacity={entry.data_quality_flag === 'NO_DATA' ? 0.3 : 0.85}
                  strokeDasharray={entry.data_quality_flag === 'NO_DATA' ? '4 2' : undefined}
                  stroke={entry.data_quality_flag === 'NO_DATA' ? '#ef4444' : 'transparent'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Source Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-text-muted">
        {(Object.entries(SOURCE_COLORS) as [PrecipitationSourceType, string][]).map(
          ([key, color]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
              <span>{SOURCE_LABELS[key]}</span>
            </div>
          ),
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-red-500 opacity-40" />
          <span>Missing Data</span>
        </div>
      </div>
    </div>
  );
}
