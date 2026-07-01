import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileEdit, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useDataCorrections } from '@/hooks/useDataCorrections';
import { ENTITY_TYPE_LABELS, STATUS_LABELS } from '@/types/corrections';

export function CorrectionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getEffectiveRole, loading: permissionsLoading } = usePermissions();
  const { corrections, loading, reviewCorrection } = useDataCorrections();
  const role = getEffectiveRole();

  const [reviewComment, setReviewComment] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | 'pending_review' | 'approved' | 'rejected'>('pending_review');

  // RBAC gate — wait for permissions to load before deciding
  useEffect(() => {
    if (permissionsLoading) return;
    if (!['executive', 'environmental_manager', 'admin'].includes(role)) {
      navigate('/dashboard', { replace: true });
    }
  }, [role, permissionsLoading, navigate]);

  const filtered = corrections.filter(c => filter === 'all' || c.status === filter);

  const statusColors: Record<string, string> = {
    draft: 'bg-qo-nested text-text-muted border-black/[0.08]',
    pending_review: 'bg-amber-500/10 text-qo-ochre-text border-amber-500/20',
    approved: 'bg-emerald-500/10 text-qo-sage-text border-emerald-500/20',
    rejected: 'bg-red-500/10 text-qo-risk border-red-500/20',
  };

  return (
    <div className="mx-auto max-w-[1920px] space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl bg-amber-500/10 p-2.5">
            <FileEdit className="h-5 w-5 text-qo-ochre-text" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Data Corrections
            </h1>
            <p className="mt-0.5 text-sm text-text-muted">
              Two-person review workflow for compliance data changes — Policy 1.45
            </p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-black/[0.06] bg-qo-nested px-5 py-3">
        {(['pending_review', 'approved', 'rejected', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              filter === f
                ? 'bg-black/[0.06] text-text-primary shadow-lg shadow-white/5'
                : 'text-text-muted hover:bg-black/[0.04] hover:text-text-secondary',
            )}
          >
            {f === 'all' ? 'All' : STATUS_LABELS[f]}
            {f === 'pending_review' && (
              <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-qo-ochre-text">
                {corrections.filter(c => c.status === 'pending_review').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Corrections List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-black/[0.12] border-t-white/60" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-black/[0.06] bg-qo-nested py-12 text-center text-sm text-text-muted">
            {filter === 'pending_review'
              ? 'No corrections pending review.'
              : 'No corrections match the current filter.'}
          </div>
        ) : (
          filtered.map(correction => {
            const isSelf = correction.requested_by === user?.id;

            return (
              <div
                key={correction.id}
                className="rounded-xl border border-black/[0.06] bg-qo-nested p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        statusColors[correction.status],
                      )}>
                        {STATUS_LABELS[correction.status]}
                      </span>
                      <span className="rounded border border-black/[0.08] bg-qo-nested px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                        {ENTITY_TYPE_LABELS[correction.entity_type]}
                      </span>
                    </div>

                    <div className="text-sm text-text-primary">
                      Change <span className="font-mono text-purple-400">{correction.field_name}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="mb-1 text-[10px] font-medium text-qo-risk/60">Original</div>
                        <div className="rounded-lg border border-red-500/10 bg-red-500/5 p-2 font-mono text-xs text-text-secondary">
                          {JSON.stringify(correction.original_value)}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] font-medium text-qo-sage-text/60">Proposed</div>
                        <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-2 font-mono text-xs text-text-secondary">
                          {JSON.stringify(correction.proposed_value)}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-medium uppercase text-text-muted">Justification</div>
                      <div className="mt-0.5 text-xs text-text-secondary">{correction.justification}</div>
                    </div>

                    {correction.supporting_evidence_path && (
                      <div className="text-xs text-text-muted">
                        Evidence: <span className="text-blue-400">{correction.supporting_evidence_path}</span>
                      </div>
                    )}

                    <div className="text-[10px] text-text-muted">
                      Requested {new Date(correction.requested_at).toLocaleString()}
                      {correction.reviewed_at && (
                        <> · Reviewed {new Date(correction.reviewed_at).toLocaleString()}</>
                      )}
                    </div>

                    {correction.review_comment && (
                      <div className="rounded-lg border border-black/[0.06] bg-qo-nested px-3 py-2 text-xs text-text-secondary">
                        Review comment: {correction.review_comment}
                      </div>
                    )}
                  </div>

                  {/* Actions — only for pending, and NOT your own request */}
                  {correction.status === 'pending_review' && (
                    <div className="ml-4 shrink-0 space-y-2">
                      {isSelf ? (
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-qo-ochre-text">
                          You cannot review<br />your own request.
                        </div>
                      ) : (
                        <>
                          <textarea
                            value={reviewComment[correction.id] ?? ''}
                            onChange={e => setReviewComment(prev => ({ ...prev, [correction.id]: e.target.value }))}
                            placeholder="Comment (required for rejection)"
                            className="w-48 rounded-lg border border-black/[0.08] bg-crystal-surface px-2.5 py-1.5 text-xs text-text-secondary outline-none placeholder:text-text-muted"
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => reviewCorrection(correction.id, 'approved', reviewComment[correction.id])}
                              className="flex items-center gap-1 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-qo-sage-text transition-colors hover:bg-emerald-500/20"
                            >
                              <Check size={12} /> Approve
                            </button>
                            <button
                              onClick={() => {
                                if (!reviewComment[correction.id]?.trim()) {
                                  toast.error('Comment required for rejection');
                                  return;
                                }
                                reviewCorrection(correction.id, 'rejected', reviewComment[correction.id]);
                              }}
                              className="flex items-center gap-1 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-qo-risk transition-colors hover:bg-red-500/20"
                            >
                              <X size={12} /> Reject
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

