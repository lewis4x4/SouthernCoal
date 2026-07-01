import { Link } from 'react-router-dom';
import { useState } from 'react';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { GAP_REVIEW_STATUS_LABELS } from '@/lib/samplingGapSeverity';
import { GapKindBadge, GapSeverityBadge } from '@/components/sampling-gaps/SamplingGapSummaryCards';
import type { SamplingGapRecord, SamplingGapReviewStatus } from '@/types/samplingGaps';

const TRIAGE_OPTIONS: SamplingGapReviewStatus[] = [
  'acknowledged',
  'disputed',
  'force_majeure',
  'resolved',
];

interface Props {
  row: SamplingGapRecord | null;
  onUpdate: (gapId: string, status: SamplingGapReviewStatus, notes?: string) => Promise<string | null>;
  canTriage: boolean;
}

export function SamplingGapDetailPanel({ row, onUpdate, canTriage }: Props) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  if (!row) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 text-sm text-text-muted">
        Select a gap row to triage. Severity is for internal review — not an asserted penalty.
      </div>
    );
  }

  async function handleStatus(status: SamplingGapReviewStatus) {
    if (!row) return;
    setSaving(true);
    const err = await onUpdate(row.id, status, notes.trim() || undefined);
    setSaving(false);

    if (err) {
      toast.error(err);
    } else {
      toast.success(`Marked ${GAP_REVIEW_STATUS_LABELS[status] ?? status}`);
      setNotes('');
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <GapKindBadge kind={row.gap_kind} />
        <GapSeverityBadge severity={row.severity} />
        <span className="text-[10px] uppercase tracking-wide text-amber-400/90">
          DRAFT — internal advisory
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-text-muted">Outfall</dt>
          <dd className="text-text-primary">{row.outfalls?.description ?? row.outfalls?.outfall_number ?? row.outfall_id}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Parameter</dt>
          <dd className="text-text-primary">{row.parameters?.name ?? row.parameters?.short_name ?? row.parameter_id}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Scheduled</dt>
          <dd className="tabular-nums">{row.scheduled_date}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Window end</dt>
          <dd className="tabular-nums">{row.window_end ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Days late</dt>
          <dd className="tabular-nums">{row.days_late}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Dispatch status</dt>
          <dd>{row.dispatch_status ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Calendar status</dt>
          <dd>{row.calendar_status ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Field outcome</dt>
          <dd>{row.field_visit_outcome ?? '—'}</dd>
        </div>
      </dl>

      {row.skip_reason && (
        <p className="text-xs text-text-secondary">
          <span className="text-text-muted">Skip reason:</span> {row.skip_reason}
        </p>
      )}

      {row.gap_kind === 'missed' && (
        <Link
          to={`/compliance/defensible-miss?gapId=${row.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-[11px] font-medium text-purple-300 hover:bg-purple-500/15"
        >
          <FileText size={12} />
          Open defensible-miss packet
        </Link>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-muted">Triage notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          disabled={!canTriage || saving}
          placeholder="Optional notes for audit trail"
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-white/20"
        />
      </div>

      {canTriage && (
        <div className="flex flex-wrap gap-2">
          {TRIAGE_OPTIONS.map((status) => (
            <button
              key={status}
              type="button"
              disabled={saving}
              onClick={() => void handleStatus(status)}
              className={cn(
                'rounded-lg border border-white/[0.12] bg-white/[0.05] px-3 py-1.5 text-[11px] font-medium',
                'text-text-primary hover:bg-white/[0.1] disabled:opacity-50',
              )}
            >
              {GAP_REVIEW_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
