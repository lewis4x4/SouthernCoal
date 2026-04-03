import { useState, useCallback, useEffect } from 'react';
import { X, CheckCircle, Droplets } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { PrecipitationEvent } from '@/types/weather';

interface AffectedOutfall {
  schedule_id: string;
  outfall_id: string;
  permit_id: string;
  outfall_number: string;
  permit_number: string;
  site_name: string;
  threshold: number;
  selected: boolean;
}

interface ActivateSamplingDialogProps {
  event: PrecipitationEvent;
  isOpen: boolean;
  onClose: () => void;
  onActivate: (eventId: string, outfalls: AffectedOutfall[]) => Promise<void>;
}

export function ActivateSamplingDialog({
  event,
  isOpen,
  onClose,
  onActivate,
}: ActivateSamplingDialogProps) {
  const [outfalls, setOutfalls] = useState<AffectedOutfall[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch affected outfalls when dialog opens
  useEffect(() => {
    if (!isOpen || !event.weather_station_id) return;

    async function fetchOutfalls() {
      setLoading(true);
      setError(null);

      // Use the DB function to find affected outfalls
      const { data, error: rpcError } = await supabase.rpc('check_rain_event_thresholds', {
        p_station_id: event.weather_station_id,
        p_reading_date: event.event_date ?? new Date(event.created_at).toISOString().split('T')[0],
        p_rainfall_inches: event.rainfall_inches,
      });

      if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }

      // Enrich with outfall/permit details
      const outfallIds = (data ?? []).map((d: { outfall_id: string }) => d.outfall_id);
      if (outfallIds.length === 0) {
        setOutfalls([]);
        setLoading(false);
        return;
      }

      const { data: details } = await supabase
        .from('outfalls')
        .select('id, outfall_number, site_id, permit_id, sites!inner(name), npdes_permits!inner(permit_number)')
        .in('id', outfallIds);

      const enriched: AffectedOutfall[] = (data ?? []).map((d: {
        schedule_id: string;
        outfall_id: string;
        permit_id: string;
        threshold_inches: number;
        exceeded: boolean;
      }) => {
        const detail = details?.find((det: { id: string }) => det.id === d.outfall_id);
        return {
          schedule_id: d.schedule_id,
          outfall_id: d.outfall_id,
          permit_id: d.permit_id,
          outfall_number: (detail as Record<string, unknown>)?.outfall_number as string ?? 'Unknown',
          permit_number: ((detail as Record<string, unknown>)?.npdes_permits as Record<string, unknown>)?.permit_number as string ?? 'Unknown',
          site_name: ((detail as Record<string, unknown>)?.sites as Record<string, unknown>)?.name as string ?? 'Unknown',
          threshold: d.threshold_inches,
          selected: d.exceeded, // Pre-select outfalls where threshold is exceeded
        };
      });

      setOutfalls(enriched);
      setLoading(false);
    }

    fetchOutfalls();
  }, [isOpen, event.weather_station_id, event.rainfall_inches, event.event_date, event.created_at]);

  const toggleOutfall = useCallback((outfallId: string) => {
    setOutfalls((prev) =>
      prev.map((o) => (o.outfall_id === outfallId ? { ...o, selected: !o.selected } : o))
    );
  }, []);

  const selectedOutfalls = outfalls.filter((o) => o.selected);

  const handleActivate = useCallback(async () => {
    if (selectedOutfalls.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await onActivate(event.id, selectedOutfalls);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate sampling');
    } finally {
      setSubmitting(false);
    }
  }, [event.id, selectedOutfalls, onActivate, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-white/[0.08] bg-crystal-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-500 p-2">
              <Droplets className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Activate Sampling</h2>
              <p className="text-sm text-text-muted">
                {event.rainfall_inches}" recorded — select outfalls to dispatch
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Outfall list */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-white/[0.04]" />
            ))}
          </div>
        ) : outfalls.length === 0 ? (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 text-center">
            <p className="text-sm text-text-muted">
              No rain-event outfalls linked to this station. Configure outfall triggers in Weather Stations.
            </p>
          </div>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {outfalls.map((outfall) => (
              <label
                key={outfall.outfall_id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${
                  outfall.selected
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={outfall.selected}
                  onChange={() => toggleOutfall(outfall.outfall_id)}
                  className="h-4 w-4 rounded border-white/20 bg-white/[0.06] text-emerald-500 focus:ring-emerald-500/30"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-primary">
                    Outfall {outfall.outfall_number}
                  </p>
                  <p className="text-xs text-text-muted">
                    {outfall.site_name} — Permit {outfall.permit_number} — Threshold: {outfall.threshold}"
                  </p>
                </div>
                {outfall.selected && (
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                )}
              </label>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="mt-4 text-sm text-red-400">{error}</p>
        )}

        {/* Summary + Actions */}
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-text-muted">
            {selectedOutfalls.length} outfall{selectedOutfalls.length !== 1 ? 's' : ''} selected for dispatch
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-white/[0.08] px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-white/[0.04]"
            >
              Cancel
            </button>
            <button
              onClick={handleActivate}
              disabled={selectedOutfalls.length === 0 || submitting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? 'Activating...' : `Activate ${selectedOutfalls.length} Outfall${selectedOutfalls.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
