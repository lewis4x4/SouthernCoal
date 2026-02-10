import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { STATUS_LABELS, ENTITY_TYPE_LABELS } from '@/types/corrections';
import type { DataCorrection } from '@/types/corrections';

interface CorrectionHistorySectionProps {
  entityType: DataCorrection['entity_type'];
  entityId: string;
}

const statusColors: Record<string, string> = {
  draft: 'bg-white/5 text-text-muted border-white/10',
  pending_review: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
};

/**
 * Reusable correction history section for entity detail views.
 * Embed in any detail view:
 *   <CorrectionHistorySection entityType="lab_result" entityId={id} />
 */
export function CorrectionHistorySection({ entityType, entityId }: CorrectionHistorySectionProps) {
  const [corrections, setCorrections] = useState<DataCorrection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('data_corrections')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[corrections] History fetch failed:', error.message);
      }
      setCorrections((data ?? []) as DataCorrection[]);
      setLoading(false);
    }
    fetch();
  }, [entityType, entityId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-text-muted">
        <div className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-white/60" />
        Loading correction history...
      </div>
    );
  }

  if (corrections.length === 0) {
    return (
      <div className="py-3 text-xs text-text-muted">
        No data corrections for this {ENTITY_TYPE_LABELS[entityType].toLowerCase()}.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
        Correction History ({corrections.length})
      </h4>
      {corrections.map(c => (
        <div
          key={c.id}
          className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
        >
          <div className="flex items-center gap-2">
            <span className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-medium',
              statusColors[c.status],
            )}>
              {STATUS_LABELS[c.status]}
            </span>
            <span className="font-mono text-xs text-purple-400">{c.field_name}</span>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[9px] font-medium text-red-400/60">Original</div>
              <div className="font-mono text-[11px] text-text-secondary">
                {JSON.stringify(c.original_value)}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-medium text-emerald-400/60">Proposed</div>
              <div className="font-mono text-[11px] text-text-secondary">
                {JSON.stringify(c.proposed_value)}
              </div>
            </div>
          </div>

          <div className="mt-1.5 text-[10px] text-text-muted">
            {new Date(c.requested_at).toLocaleString()}
            {c.review_comment && (
              <span className="ml-2 text-text-secondary">&middot; {c.review_comment}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
