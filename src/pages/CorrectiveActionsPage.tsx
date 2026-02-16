import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, AlertTriangle, Clock, CheckCircle2, PlayCircle } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useCorrectiveActions } from '@/hooks/useCorrectiveActions';
import { CorrectiveActionList } from '@/components/corrective-actions/CorrectiveActionList';
import { SpotlightCard } from '@/components/ui/SpotlightCard';

export function CorrectiveActionsPage() {
  const navigate = useNavigate();
  const { can, loading: permissionsLoading } = usePermissions();
  const { actions, loading, error, counts } = useCorrectiveActions();

  // RBAC gate
  useEffect(() => {
    if (permissionsLoading) return;
    if (!can('ca_view')) {
      navigate('/dashboard', { replace: true });
    }
  }, [can, permissionsLoading, navigate]);

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-text-muted">Loading permissions...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
          <ClipboardCheck className="h-6 w-6 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            Corrective Actions
          </h1>
          <p className="text-sm text-text-muted">
            EMS Document 2015-013 — 7-Step Corrective Action Workflow
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <SpotlightCard
          className="p-4"
          spotlightColor="rgba(239, 68, 68, 0.08)"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="h-4 w-4 text-red-400" />
            </div>
            <div>
              <div className="text-2xl font-semibold text-red-400">
                {counts.overdue}
              </div>
              <div className="text-[11px] text-text-muted uppercase tracking-wider">
                Overdue
              </div>
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard
          className="p-4"
          spotlightColor="rgba(6, 182, 212, 0.08)"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <Clock className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <div className="text-2xl font-semibold text-cyan-400">
                {counts.open}
              </div>
              <div className="text-[11px] text-text-muted uppercase tracking-wider">
                Open
              </div>
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard
          className="p-4"
          spotlightColor="rgba(245, 158, 11, 0.08)"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <PlayCircle className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <div className="text-2xl font-semibold text-amber-400">
                {counts.in_progress}
              </div>
              <div className="text-[11px] text-text-muted uppercase tracking-wider">
                In Progress
              </div>
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard
          className="p-4"
          spotlightColor="rgba(168, 85, 247, 0.08)"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <CheckCircle2 className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <div className="text-2xl font-semibold text-purple-400">
                {counts.verified}
              </div>
              <div className="text-[11px] text-text-muted uppercase tracking-wider">
                Verified
              </div>
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard
          className="p-4"
          spotlightColor="rgba(16, 185, 129, 0.08)"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl font-semibold text-emerald-400">
                {counts.closed}
              </div>
              <div className="text-[11px] text-text-muted uppercase tracking-wider">
                Closed
              </div>
            </div>
          </div>
        </SpotlightCard>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
          Error loading corrective actions: {error}
        </div>
      )}

      {/* Main list */}
      <CorrectiveActionList actions={actions} loading={loading} />
    </div>
  );
}
