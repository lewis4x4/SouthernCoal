import { useMemo, useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EDD_REVIEW_STATUS_LABELS } from '@/lib/eddParagraph49';
import { useEddParagraph49Flags } from '@/hooks/useEddParagraph49Flags';
import { usePermissions } from '@/hooks/usePermissions';
import type { EddParagraph49ReviewStatus } from '@/lib/eddParagraph49';
import type { EddParagraph49Evaluation } from '@/types/eddParagraph49';

const STATUS_COLORS: Record<EddParagraph49ReviewStatus, string> = {
  pending: 'bg-white/[0.05] text-text-secondary border-white/[0.08]',
  acknowledged: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  disputed: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  resolved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

type FlagFilter = 'late' | 'exceedance_only' | null;

function FlagBadges({ row }: { row: EddParagraph49Evaluation }) {
  return (
    <div className="flex flex-wrap gap-1">
      {row.is_late_48h && (
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
          Late &gt;48h
        </span>
      )}
      {row.is_exceedance_only && (
        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
          Exceedance-only
        </span>
      )}
      {!row.is_late_48h && !row.is_exceedance_only && (
        <span className="text-[10px] text-text-muted">—</span>
      )}
    </div>
  );
}

export function LateIncompleteEddPage() {
  const { rows, loading, error, counts, updateReviewStatus } = useEddParagraph49Flags();
  const { can } = usePermissions();
  const canTriage = can('verify');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flagFilter, setFlagFilter] = useState<FlagFilter>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    if (flagFilter === 'late') return rows.filter((r) => r.is_late_48h);
    if (flagFilter === 'exceedance_only') return rows.filter((r) => r.is_exceedance_only);
    return rows;
  }, [rows, flagFilter]);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  async function handleStatus(status: EddParagraph49ReviewStatus) {
    if (!selected) return;
    setSaving(true);
    const err = await updateReviewStatus(selected.id, status, notes.trim() || undefined);
    setSaving(false);
    if (err) return;
    setNotes('');
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Clock size={20} className="text-cyan-400" />
          <h2 className="text-xl font-semibold text-text-primary">Late &amp; Incomplete EDDs</h2>
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          CD ¶49 advisory — 48-hour analysis-to-arrival clock and exceedance-only transmittal flags
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-wide text-amber-400/90">
          DRAFT — for counsel review; not verified penalty amounts or legal conclusions
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { key: 'flagged' as const, label: 'Any flag', count: counts.flagged },
          { key: 'late' as const, label: 'Late &gt;48h', count: counts.late },
          { key: 'exceedance_only' as const, label: 'Exceedance-only', count: counts.exceedanceOnly },
          { key: 'pending' as const, label: 'Pending triage', count: counts.pending },
        ].map((card) => {
          const isFilter = card.key === 'late' || card.key === 'exceedance_only';
          const isActive = isFilter && flagFilter === card.key;
          return (
            <button
              key={card.key}
              type="button"
              disabled={!isFilter}
              onClick={() => {
                if (card.key === 'late') setFlagFilter((p) => (p === 'late' ? null : 'late'));
                if (card.key === 'exceedance_only') {
                  setFlagFilter((p) => (p === 'exceedance_only' ? null : 'exceedance_only'));
                }
              }}
              className={cn(
                'rounded-xl border px-4 py-3 text-left transition',
                isActive
                  ? 'border-cyan-500/40 bg-cyan-500/10'
                  : 'border-white/[0.08] bg-white/[0.02]',
                isFilter && 'hover:bg-white/[0.04]',
                !isFilter && 'cursor-default',
              )}
            >
              <p className="text-[10px] uppercase tracking-wide text-text-muted">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{card.count}</p>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-text-muted">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
          <p className="text-sm font-medium text-text-primary">No open ¶49 flags</p>
          <p className="mt-2 text-xs text-text-muted max-w-md mx-auto">
            Evaluations are created automatically on each lab EDD import via import-lab-data.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="overflow-hidden rounded-xl border border-white/[0.08]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-white/[0.03] text-text-muted uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 font-medium">Lab</th>
                    <th className="px-3 py-2 font-medium">State</th>
                    <th className="px-3 py-2 font-medium">File</th>
                    <th className="px-3 py-2 font-medium">Flags</th>
                    <th className="px-3 py-2 font-medium">Hours</th>
                    <th className="px-3 py-2 font-medium">Params</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedId(row.id)}
                      className={cn(
                        'cursor-pointer border-t border-white/[0.06] hover:bg-white/[0.04]',
                        selectedId === row.id && 'bg-cyan-500/5',
                      )}
                    >
                      <td className="px-3 py-2.5 text-text-primary">{row.lab_name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-text-secondary">{row.site_state ?? '—'}</td>
                      <td className="px-3 py-2.5 text-text-muted max-w-[140px] truncate">
                        {row.file_name ?? '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <FlagBadges row={row} />
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-text-primary">
                        {row.hours_analysis_to_arrival ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-text-secondary">
                        {row.parameters_received}/{row.parameters_expected || '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                            STATUS_COLORS[row.review_status],
                          )}
                        >
                          {EDD_REVIEW_STATUS_LABELS[row.review_status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selected && (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Triage</h3>
              <dl className="space-y-2 text-xs">
                <div>
                  <dt className="text-text-muted">Arrival</dt>
                  <dd className="text-text-primary">{new Date(selected.arrival_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Latest analysis</dt>
                  <dd className="text-text-primary">{selected.latest_analysis_date ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Exceedance params</dt>
                  <dd className="text-text-primary tabular-nums">{selected.exceedance_parameter_count}</dd>
                </div>
              </dl>
              {canTriage && (
                <>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Review notes (optional)"
                    className="w-full rounded-lg border border-white/[0.1] bg-black/20 px-3 py-2 text-xs text-text-primary"
                  />
                  <div className="flex flex-wrap gap-2">
                    {(['acknowledged', 'disputed', 'resolved'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={saving}
                        onClick={() => void handleStatus(status)}
                        className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-[10px] font-medium text-text-primary hover:bg-white/[0.06] disabled:opacity-50"
                      >
                        {EDD_REVIEW_STATUS_LABELS[status]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
