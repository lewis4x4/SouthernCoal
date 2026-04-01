import { useState, useEffect } from 'react';
import { loadPermitsWithStateCodes } from '@/lib/npdesPermitState';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import { AlertTriangle, Check, HelpCircle, X } from 'lucide-react';

interface UnconfirmedPermit {
  id: string;
  permit_number: string;
  permittee_name: string;
  state_code: string;
  expiration_date: string | null;
  status: string;
  administratively_continued: boolean | null;
}

type Resolution = 'continued' | 'expired' | 'investigate';

export function DataQualityPanel() {
  const { log } = useAuditLog();
  const [permits, setPermits] = useState<UnconfirmedPermit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string>('all');

  useEffect(() => {
    async function fetch() {
      const { rawPermits: rows, siteIdToState, permitError, sitesStateError } =
        await loadPermitsWithStateCodes(supabase, { kind: 'data_quality_expired' });
      if (permitError) {
        toast.error(`Failed to load permits: ${permitError.message}`);
        setLoading(false);
        return;
      }
      if (sitesStateError) {
        toast.error(`Failed to load permit states: ${sitesStateError.message}`);
      }
      const mapped: UnconfirmedPermit[] = rows
        .map((row) => ({
          id: row.id,
          permit_number: row.permit_number,
          permittee_name: row.permittee_name ?? '',
          state_code: (row.site_id ? siteIdToState.get(row.site_id) : null) ?? 'Unknown',
          expiration_date: row.expiration_date,
          status: row.status,
          administratively_continued: row.administratively_continued,
        }))
        .sort(
          (a, b) =>
            a.state_code.localeCompare(b.state_code) ||
            a.permit_number.localeCompare(b.permit_number),
        );
      setPermits(mapped);
      setLoading(false);
    }
    fetch();
  }, []);

  async function resolve(permit: UnconfirmedPermit, resolution: Resolution) {
    setSaving(permit.id);

    let update: Record<string, unknown> = {};
    if (resolution === 'continued') {
      update = { administratively_continued: true };
    } else if (resolution === 'expired') {
      update = { administratively_continued: false };
    } else {
      // 'investigate' — mark as false for now but flag in audit
      update = { administratively_continued: false };
    }

    const { error } = await supabase
      .from('npdes_permits')
      .update(update)
      .eq('id', permit.id);

    if (error) {
      toast.error(`Failed to update ${permit.permit_number}: ${error.message}`);
    } else {
      setPermits((prev) => prev.filter((p) => p.id !== permit.id));
      toast.success(`${permit.permit_number} marked as ${resolution}`);
      log('data_quality_status_changed', {
        action: 'permit_status_resolution',
        permit_number: permit.permit_number,
        resolution,
        state: permit.state_code,
      });
    }
    setSaving(null);
  }

  const states = ['all', ...new Set(permits.map((p) => p.state_code))];
  const filtered = stateFilter === 'all' ? permits : permits.filter((p) => p.state_code === stateFilter);

  // Group by state
  const byState = filtered.reduce<Record<string, UnconfirmedPermit[]>>((acc, p) => {
    if (!acc[p.state_code]) acc[p.state_code] = [];
    acc[p.state_code]!.push(p);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-amber-300">
            {permits.length} Unconfirmed Permit Statuses
          </h4>
          <p className="text-xs text-text-muted mt-1">
            These permits show as &quot;expired&quot; but may be administratively continued.
            Owner: Steve Ball. Every resolution is logged to the audit trail.
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1.5">
        {states.map((s) => (
          <button
            key={s}
            onClick={() => setStateFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all border ${
              stateFilter === s
                ? 'bg-white/[0.08] border-white/[0.12] text-text-primary'
                : 'bg-white/[0.02] border-white/[0.06] text-text-muted hover:border-white/[0.1]'
            }`}
          >
            {s === 'all' ? `All (${permits.length})` : `${s} (${permits.filter((p) => p.state_code === s).length})`}
          </button>
        ))}
      </div>

      {/* Permits by state */}
      {Object.entries(byState).sort().map(([state, statePermits]) => (
        <div key={state} className="space-y-2">
          <h3 className="text-xs font-semibold text-text-secondary">{state} ({statePermits.length})</h3>
          <div className="space-y-1.5">
            {statePermits.map((permit) => (
              <div
                key={permit.id}
                className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-medium text-text-primary">
                      {permit.permit_number}
                    </span>
                    {permit.expiration_date && (
                      <span className="text-[10px] text-text-muted">
                        Exp: {new Date(permit.expiration_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-text-muted truncate max-w-xs">
                    {permit.permittee_name}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  <button
                    onClick={() => resolve(permit, 'continued')}
                    disabled={saving === permit.id}
                    className="rounded-md px-2 py-1 text-[10px] font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                    title="Administratively Continued"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => resolve(permit, 'expired')}
                    disabled={saving === permit.id}
                    className="rounded-md px-2 py-1 text-[10px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    title="Truly Expired"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => resolve(permit, 'investigate')}
                    disabled={saving === permit.id}
                    className="rounded-md px-2 py-1 text-[10px] font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                    title="Needs Investigation"
                  >
                    <HelpCircle className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-text-muted">
          <Check className="h-8 w-8 mb-2 text-green-400 opacity-50" />
          <p className="text-sm">All permit statuses have been confirmed.</p>
        </div>
      )}
    </div>
  );
}
