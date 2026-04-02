import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ListOrdered,
  MapPinned,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { FieldDataSyncBar } from '@/components/field/FieldDataSyncBar';
import { FieldDispatchLoadAlerts } from '@/components/field/FieldDispatchLoadAlerts';
import { FieldSameOutfallDayWarning } from '@/components/field/FieldSameOutfallDayWarning';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useFieldOps } from '@/hooks/useFieldOps';
import { groupSameOutfallSameDay } from '@/lib/fieldSameOutfallDay';
import { getEasternTodayYmd } from '@/lib/operationalDate';
import { visitNeedsDisposition } from '@/lib/fieldVisitDisposition';
import { visitIsOpenOverdue } from '@/lib/fieldVisitStatus';
import type { FieldVisitListItem } from '@/types';

const MANAGER_ROLES = ['site_manager', 'environmental_manager', 'executive', 'admin'];

function statusTone(visit: FieldVisitListItem) {
  if (visit.visit_status === 'completed') return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10';
  if (visit.visit_status === 'in_progress') return 'text-amber-300 border-amber-500/20 bg-amber-500/10';
  if (visit.visit_status === 'cancelled') return 'text-red-300 border-red-500/20 bg-red-500/10';
  return 'text-cyan-300 border-cyan-500/20 bg-cyan-500/10';
}

export function FieldDispatchPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getEffectiveRole } = usePermissions();
  const role = getEffectiveRole();
  const canDispatch = MANAGER_ROLES.includes(role);

  const {
    permits,
    outfalls,
    users,
    visits,
    loading,
    lastSyncedAt,
    outboundPendingCount,
    outboundQueueDiagnostic,
    clearOutboundQueueDiagnostic,
    dispatchLoadAlerts,
    refresh,
    createVisit,
  } = useFieldOps();

  const [queueFilter, setQueueFilter] = useState<
    'all' | 'mine' | 'today' | 'needs_outcome' | 'overdue'
  >('all');
  const [queueSort, setQueueSort] = useState<'newest' | 'route_order'>('newest');

  const [permitId, setPermitId] = useState('');
  const [outfallId, setOutfallId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [scheduledDate, setScheduledDate] = useState(getEasternTodayYmd());
  const [fieldNotes, setFieldNotes] = useState('');
  const [creating, setCreating] = useState(false);

  const outfallOptions = useMemo(
    () => outfalls.filter((outfall) => !permitId || outfall.permit_id === permitId),
    [outfalls, permitId],
  );

  const todayStr = getEasternTodayYmd();

  const filteredVisits = useMemo(() => {
    let list = visits;
    if (queueFilter === 'mine' && user?.id) {
      list = list.filter((visit) => visit.assigned_to === user.id);
    }
    if (queueFilter === 'today') {
      list = list.filter((visit) => visit.scheduled_date === todayStr);
    }
    if (queueFilter === 'needs_outcome') {
      list = list.filter((visit) => visitNeedsDisposition(visit));
    }
    if (queueFilter === 'overdue') {
      list = list.filter((visit) => visitIsOpenOverdue(visit, todayStr));
    }
    const sorted = [...list];
    if (queueSort === 'route_order') {
      sorted.sort((a, b) => {
        const ar = a.route_stop_sequence;
        const br = b.route_stop_sequence;
        if (ar != null && br != null && ar !== br) return ar - br;
        if (ar != null && br == null) return -1;
        if (ar == null && br != null) return 1;
        return `${a.scheduled_date}T${a.created_at}`.localeCompare(`${b.scheduled_date}T${b.created_at}`);
      });
    } else {
      sorted.sort((a, b) => `${b.scheduled_date}T${b.created_at}`.localeCompare(`${a.scheduled_date}T${a.created_at}`));
    }
    return sorted;
  }, [queueFilter, queueSort, todayStr, user?.id, visits]);

  const queueNeedsDispositionCount = useMemo(
    () => filteredVisits.filter((v) => visitNeedsDisposition(v)).length,
    [filteredVisits],
  );


  const queueOutfallDayConflicts = useMemo(() => groupSameOutfallSameDay(visits), [visits]);

  async function handleCreate() {
    if (!permitId || !outfallId || !assignedTo || !scheduledDate) {
      toast.error('Permit, outfall, assignee, and scheduled date are required');
      return;
    }

    try {
      setCreating(true);
      const created = await createVisit({
        permitId,
        outfallId,
        assignedTo,
        scheduledDate,
        fieldNotes,
      });
      setOutfallId('');
      setFieldNotes('');
      toast.success('Field visit dispatched');
      navigate(`/field/visits/${created.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to dispatch field visit');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      <details className="rounded-2xl border border-white/[0.06] bg-white/[0.02]">
        <summary className="flex min-h-12 cursor-pointer items-center gap-3 px-4 text-sm text-text-secondary">
          <span className="flex-1 font-medium text-text-primary">Field Queue</span>
          <span className="text-text-muted">{queueNeedsDispositionCount} open</span>
        </summary>
        <div className="space-y-3 border-t border-white/[0.06] p-3">
          <FieldDataSyncBar
            loading={loading}
            lastSyncedAt={lastSyncedAt}
            pendingOutboundCount={outboundPendingCount}
            queueFlushDiagnostic={outboundQueueDiagnostic}
            onDismissQueueFlushDiagnostic={clearOutboundQueueDiagnostic}
            onRefresh={refresh}
            auditRefreshPayload={{ surface: 'field_dispatch' }}
          />
          <FieldDispatchLoadAlerts alerts={dispatchLoadAlerts} />
          <FieldSameOutfallDayWarning
            groups={queueOutfallDayConflicts}
            contextLabel="field queue (WV)"
            detailListClassName="max-h-52 overflow-y-auto pr-1"
          />
        </div>
      </details>

      {canDispatch && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-cyan-300" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              Manual Dispatch
            </h2>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="space-y-2">
              <span className="text-sm font-medium text-text-muted">Permit</span>
              <select
                value={permitId}
                onChange={(e) => {
                  setPermitId(e.target.value);
                  setOutfallId('');
                }}
                className="w-full min-h-12 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-base text-text-primary outline-none focus:border-cyan-400/30"
              >
                <option value="">Select permit</option>
                {permits.map((permit) => (
                  <option key={permit.id} value={permit.id}>
                    {permit.permit_number}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-text-muted">Outfall</span>
              <select
                value={outfallId}
                onChange={(e) => setOutfallId(e.target.value)}
                className="w-full min-h-12 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-base text-text-primary outline-none focus:border-cyan-400/30"
              >
                <option value="">Select outfall</option>
                {outfallOptions.map((outfall) => (
                  <option key={outfall.id} value={outfall.id}>
                    {outfall.outfall_number}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-text-muted">Assigned sampler</span>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full min-h-12 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-base text-text-primary outline-none focus:border-cyan-400/30"
              >
                <option value="">Select assignee</option>
                {users.filter((fieldUser) => fieldUser.is_active).map((fieldUser) => (
                  <option key={fieldUser.id} value={fieldUser.id}>
                    {[fieldUser.first_name, fieldUser.last_name].filter(Boolean).join(' ') || fieldUser.email}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-text-muted">Scheduled date</span>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full min-h-12 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-base text-text-primary outline-none focus:border-cyan-400/30"
              />
            </label>
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-sm font-medium text-text-muted">Dispatch notes</span>
            <textarea
              value={fieldNotes}
              onChange={(e) => setFieldNotes(e.target.value)}
              rows={3}
              placeholder="Optional instructions for the field team."
              className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 text-base text-text-primary outline-none focus:border-cyan-400/30"
            />
          </label>

          <button
            onClick={handleCreate}
            disabled={creating}
            className="mt-4 min-h-12 w-full rounded-2xl bg-cyan-500/15 text-base font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25 active:bg-cyan-500/30 disabled:opacity-60"
          >
            {creating ? 'Dispatching…' : 'Dispatch field visit'}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'mine', 'today', 'needs_outcome', 'overdue'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setQueueFilter(key)}
            className={`min-h-12 rounded-2xl px-4 text-sm font-medium transition-colors ${
              queueFilter === key
                ? 'bg-cyan-500/20 text-cyan-200'
                : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08] active:bg-white/[0.12]'
            }`}
          >
            {key === 'all'
              ? 'All'
              : key === 'mine'
                ? 'Mine'
                : key === 'today'
                  ? 'Today'
                  : key === 'needs_outcome'
                    ? 'Open'
                    : 'Overdue'}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => setQueueSort('newest')}
            className={`min-h-12 rounded-2xl px-4 text-sm font-medium transition-colors ${
              queueSort === 'newest'
                ? 'bg-cyan-500/20 text-cyan-200'
                : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08] active:bg-white/[0.12]'
            }`}
          >
            Newest
          </button>
          <button
            type="button"
            onClick={() => setQueueSort('route_order')}
            className={`inline-flex min-h-12 items-center gap-1.5 rounded-2xl px-4 text-sm font-medium transition-colors ${
              queueSort === 'route_order'
                ? 'bg-cyan-500/20 text-cyan-200'
                : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08] active:bg-white/[0.12]'
            }`}
          >
            <ListOrdered className="h-4 w-4" />
            Route
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]" />
          ))
        ) : filteredVisits.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-8 text-center text-sm text-text-muted">
            No field visits match this filter.
          </div>
        ) : (
          filteredVisits.map((visit) => (
            <Link
              key={visit.id}
              to={`/field/visits/${visit.id}`}
              className={`flex min-h-[60px] items-center gap-3 rounded-2xl border px-4 py-3 transition-colors hover:bg-white/[0.04] active:bg-white/[0.06] ${
                visitNeedsDisposition(visit)
                  ? 'border-l-2 border-l-cyan-400/30 border-y-white/[0.06] border-r-white/[0.06]'
                  : 'border-white/[0.06]'
              }`}
            >
              {visit.route_stop_sequence != null ? (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-sm font-bold text-cyan-200">
                  {visit.route_stop_sequence}
                </span>
              ) : (
                <MapPinned className="h-5 w-5 shrink-0 text-cyan-300" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text-primary">
                  {visit.permit_number ?? 'Permit'} / {visit.outfall_number ?? 'Outfall'}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  <span>{new Date(`${visit.scheduled_date}T00:00:00`).toLocaleDateString()}</span>
                  <span>{visit.assigned_to_name}</span>
                </span>
              </span>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusTone(visit)}`}>
                {visit.visit_status.replace('_', ' ')}
              </span>
              {visitIsOpenOverdue(visit, todayStr) ? <span className="h-2 w-2 shrink-0 rounded-full bg-red-400" /> : null}
              {visit.potential_force_majeure ? <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" /> : null}
              {visit.outcome === 'access_issue' ? <span className="h-2 w-2 shrink-0 rounded-full bg-rose-400" /> : null}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
