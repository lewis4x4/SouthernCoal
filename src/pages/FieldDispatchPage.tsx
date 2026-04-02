import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  ListOrdered,
  MapPinned,
  Plus,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { FieldDataSyncBar } from '@/components/field/FieldDataSyncBar';
import { FieldDispatchLoadAlerts } from '@/components/field/FieldDispatchLoadAlerts';
import { FieldSameOutfallDayWarning } from '@/components/field/FieldSameOutfallDayWarning';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useFieldOps } from '@/hooks/useFieldOps';
import { groupSameOutfallSameDay } from '@/lib/fieldSameOutfallDay';
import {
  FIELD_HANDOFF_GOVERNANCE_INBOX,
  governanceIssuesInboxHref,
} from '@/lib/governanceInboxNav';
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

  const queueForceMajeureCount = useMemo(
    () => filteredVisits.filter((v) => v.potential_force_majeure).length,
    [filteredVisits],
  );

  const queueAccessIssueCount = useMemo(
    () => filteredVisits.filter((v) => v.outcome === 'access_issue').length,
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
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            Field Queue
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Open the next assigned stop fast. Dispatch controls stay secondary to the live work queue.
          </p>
        </div>
        <Link
          to="/field/route"
          className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-500/20"
        >
          Today&apos;s route
        </Link>
      </div>

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

      {canDispatch && (
        <SpotlightCard className="p-4 sm:p-5" spotlightColor="rgba(6, 182, 212, 0.08)">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-cyan-300" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              Manual Dispatch
            </h2>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2">
              <span className="text-xs font-medium text-text-muted">Permit</span>
              <select
                value={permitId}
                onChange={(e) => {
                  setPermitId(e.target.value);
                  setOutfallId('');
                }}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-400/30"
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
              <span className="text-xs font-medium text-text-muted">Outfall</span>
              <select
                value={outfallId}
                onChange={(e) => setOutfallId(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-400/30"
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
              <span className="text-xs font-medium text-text-muted">Assigned sampler</span>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-400/30"
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
              <span className="text-xs font-medium text-text-muted">Scheduled date</span>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-400/30"
              />
            </label>
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-xs font-medium text-text-muted">Dispatch notes</span>
            <textarea
              value={fieldNotes}
              onChange={(e) => setFieldNotes(e.target.value)}
              rows={3}
              placeholder="Optional instructions for the field team."
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none focus:border-cyan-400/30"
            />
          </label>

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="rounded-xl bg-cyan-500/15 px-4 py-2.5 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25 disabled:opacity-60"
            >
              {creating ? 'Dispatching…' : 'Dispatch field visit'}
            </button>
          </div>
        </SpotlightCard>
      )}

      <SpotlightCard className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-text-muted">Queue</span>
          <div className="flex flex-wrap gap-2">
            {(['all', 'mine', 'today', 'needs_outcome', 'overdue'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setQueueFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  queueFilter === key
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'
                }`}
              >
                {key === 'all'
                  ? 'All'
                  : key === 'mine'
                    ? 'My assignments'
                    : key === 'today'
                      ? 'Today'
                      : key === 'needs_outcome'
                        ? 'Needs outcome'
                        : 'Overdue open'}
              </button>
            ))}
          </div>
          <span className="text-xs font-medium text-text-muted">Sort</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setQueueSort('newest')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                queueSort === 'newest'
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'
              }`}
            >
              Newest
            </button>
            <button
              type="button"
              onClick={() => setQueueSort('route_order')}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                queueSort === 'route_order'
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'
              }`}
            >
              <ListOrdered className="h-3.5 w-3.5" />
              Route order
            </button>
          </div>
        </div>
        <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3 text-xs text-text-secondary">
          <div className="flex flex-wrap items-center gap-2">
            <ClipboardList className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden />
            <span>
              <span className="font-semibold text-cyan-200/90">{queueNeedsDispositionCount}</span>
              {' of '}
              {filteredVisits.length} shown still need a field outcome (complete the visit).
            </span>
          </div>
          {queueForceMajeureCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-amber-200/90">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
              <span>
                <span className="font-semibold text-amber-200">{queueForceMajeureCount}</span>
                {' visit'}
                {queueForceMajeureCount === 1 ? '' : 's'} flagged potential force majeure — review visits and the{' '}
                <Link
                  to={governanceIssuesInboxHref(FIELD_HANDOFF_GOVERNANCE_INBOX)}
                  className="font-semibold text-amber-100 underline decoration-amber-400/45 underline-offset-2 hover:text-white"
                >
                  governance inbox
                </Link>
                .
              </span>
            </div>
          )}
          {queueAccessIssueCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-rose-200/90">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden />
              <span>
                <span className="font-semibold text-rose-200">{queueAccessIssueCount}</span>
                {' visit'}
                {queueAccessIssueCount === 1 ? '' : 's'} with access issue outcome — confirm documentation and{' '}
                <Link
                  to={governanceIssuesInboxHref(FIELD_HANDOFF_GOVERNANCE_INBOX)}
                  className="font-semibold text-rose-100 underline decoration-rose-400/45 underline-offset-2 hover:text-white"
                >
                  governance follow-up
                </Link>
                .
              </span>
            </div>
          )}
        </div>
      </SpotlightCard>

      <div className="grid gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]" />
          ))
        ) : filteredVisits.length === 0 ? (
          <SpotlightCard className="p-6 lg:col-span-2">
            <p className="text-sm text-text-muted">No field visits match this filter.</p>
          </SpotlightCard>
        ) : (
          filteredVisits.map((visit) => (
            <Link key={visit.id} to={`/field/visits/${visit.id}`}>
              <SpotlightCard
                className={`h-full p-6 transition-all hover:border-white/[0.12] ${
                  visitNeedsDisposition(visit)
                    ? 'border-l-2 border-l-cyan-400/35 pl-[calc(1.5rem-2px)]'
                    : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <MapPinned className="h-4 w-4 text-cyan-300" />
                      <h3 className="text-base font-semibold text-text-primary">
                        {visit.permit_number ?? 'Permit'} / {visit.outfall_number ?? 'Outfall'}
                      </h3>
                      {visit.route_stop_sequence != null && (
                        <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200">
                          Stop {visit.route_stop_sequence}
                        </span>
                      )}
                      {visitIsOpenOverdue(visit, todayStr) && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-500/35 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-200">
                          <AlertTriangle className="h-3 w-3" />
                          Overdue
                        </span>
                      )}
                      {visit.potential_force_majeure && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          FM candidate
                        </span>
                      )}
                      {visit.outcome === 'access_issue' && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/35 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-200">
                          <ShieldAlert className="h-3 w-3" aria-hidden />
                          Access issue
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-muted">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {new Date(`${visit.scheduled_date}T00:00:00`).toLocaleDateString()}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="h-3.5 w-3.5" />
                        {visit.assigned_to_name}
                      </span>
                    </div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusTone(visit)}`}>
                    {visit.visit_status.replace('_', ' ')}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <div className="text-text-muted">Outcome</div>
                    <div className="mt-1 font-medium text-text-primary">
                      {visit.outcome ? visit.outcome.replace('_', ' ') : 'Pending'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <div className="text-text-muted">Force majeure flag</div>
                    <div className="mt-1 font-medium text-text-primary">
                      {visit.potential_force_majeure ? 'Raised' : 'Not raised'}
                    </div>
                  </div>
                </div>

                {(visit.scheduled_parameter_label || visit.schedule_instructions) && (
                  <div className="mt-3 space-y-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs">
                    {visit.scheduled_parameter_label ? (
                      <p className="font-medium text-text-primary">{visit.scheduled_parameter_label}</p>
                    ) : null}
                    {visit.schedule_instructions ? (
                      <p className="line-clamp-2 text-text-muted">{visit.schedule_instructions}</p>
                    ) : null}
                  </div>
                )}

                {visit.field_notes && (
                  <p className="mt-4 line-clamp-2 text-sm text-text-secondary">
                    {visit.field_notes}
                  </p>
                )}
              </SpotlightCard>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
