import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useWorkOrders } from '@/hooks/useWorkOrders';
import { useHumanOverrides } from '@/hooks/useHumanOverrides';
import {
  ArrowLeft,
  Clock,
  User,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Shield,
  ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { WorkOrderStatus, WorkOrderEvent } from '@/types/database';

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  verified: 'Verified',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<WorkOrderStatus, string> = {
  open: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  assigned: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  in_progress: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  verified: 'bg-green-500/20 text-green-300 border-green-500/30',
  cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const NEXT_STATUS: Partial<Record<WorkOrderStatus, WorkOrderStatus[]>> = {
  open: ['assigned', 'in_progress', 'cancelled'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['verified', 'in_progress'],
  cancelled: ['open'],
};

const EVENT_ICONS: Record<string, typeof Clock> = {
  created: Clock,
  assigned: User,
  status_changed: ChevronRight,
  note_added: MessageSquare,
  completed: CheckCircle2,
  verified: CheckCircle2,
  cancelled: XCircle,
  sla_warning: AlertTriangle,
  sla_breach: AlertTriangle,
};

export function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { workOrders, loading, updateStatus, addNote, fetchEvents } = useWorkOrders();
  const { hasActiveHold, placeLegalHold, legalHolds } = useHumanOverrides();
  const [events, setEvents] = useState<WorkOrderEvent[]>([]);
  const [noteText, setNoteText] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [showHoldForm, setShowHoldForm] = useState(false);
  const [holdReason, setHoldReason] = useState('');

  const wo = workOrders.find((w) => w.id === id);
  const isHeld = id ? hasActiveHold('work_order', id) : false;
  const activeHold = legalHolds.find(
    (h) => h.entity_type === 'work_order' && h.entity_id === id && h.is_active,
  );

  const loadEvents = useCallback(async () => {
    if (!id) return;
    const data = await fetchEvents(id);
    setEvents(data);
  }, [id, fetchEvents]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const isOverdue =
    wo?.due_date &&
    new Date(wo.due_date) < new Date() &&
    !['completed', 'verified', 'cancelled'].includes(wo.status);

  const handleStatusChange = async (newStatus: WorkOrderStatus) => {
    if (!id || isHeld) return;
    await updateStatus(id, newStatus, statusNotes || undefined);
    setStatusNotes('');
    loadEvents();
  };

  const handleAddNote = async () => {
    if (!id || !noteText.trim()) return;
    await addNote(id, noteText.trim());
    setNoteText('');
    loadEvents();
  };

  const handlePlaceHold = async () => {
    if (!id || !holdReason.trim()) return;
    await placeLegalHold({
      entity_type: 'work_order',
      entity_id: id,
      hold_reason: holdReason.trim(),
    });
    setHoldReason('');
    setShowHoldForm(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-2 border-amber-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!wo) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary">Work order not found</p>
        <Link to="/work-orders" className="text-amber-400 hover:underline mt-2 inline-block">
          Back to Work Orders
        </Link>
      </div>
    );
  }

  const nextStatuses = NEXT_STATUS[wo.status] ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/work-orders"
          className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
        >
          <ArrowLeft className="w-4 h-4 text-text-secondary" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{wo.title}</h1>
            {isHeld && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-medium">
                <Shield className="w-3 h-3" />
                Legal Hold
              </span>
            )}
            {isOverdue && (
              <span className="flex items-center gap-1 text-sm text-red-400">
                <AlertTriangle className="w-4 h-4" />
                Overdue
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-text-secondary">
            <span className={clsx('px-2 py-0.5 rounded text-xs font-medium border', STATUS_COLORS[wo.status])}>
              {STATUS_LABELS[wo.status]}
            </span>
            <span className="capitalize">{wo.priority} priority</span>
            {wo.category && <span>{wo.category.replace(/_/g, ' ')}</span>}
            {wo.source_type !== 'manual' && (
              <span className="text-xs bg-white/5 px-2 py-0.5 rounded">
                Source: {wo.source_type.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          {wo.description && (
            <SpotlightCard className="p-4">
              <h3 className="text-sm font-medium text-text-secondary mb-2">Description</h3>
              <p className="text-white whitespace-pre-wrap">{wo.description}</p>
            </SpotlightCard>
          )}

          {/* Status Transitions */}
          {nextStatuses.length > 0 && !isHeld && (
            <SpotlightCard className="p-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3">Update Status</h3>
              <div className="space-y-3">
                <input
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-text-secondary focus:border-amber-500/50 focus:outline-none"
                  placeholder="Status change notes (optional)..."
                />
                <div className="flex flex-wrap gap-2">
                  {nextStatuses.map((ns) => (
                    <button
                      key={ns}
                      onClick={() => handleStatusChange(ns)}
                      className={clsx(
                        'px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors',
                        STATUS_COLORS[ns],
                        'hover:opacity-80',
                      )}
                    >
                      {STATUS_LABELS[ns]}
                    </button>
                  ))}
                </div>
              </div>
            </SpotlightCard>
          )}

          {isHeld && (
            <SpotlightCard className="p-4 border-red-500/30">
              <div className="flex items-center gap-2 text-red-300">
                <Shield className="w-5 h-5" />
                <span className="font-medium">Legal Hold Active</span>
              </div>
              <p className="text-sm text-text-secondary mt-1">
                This work order is under legal hold. Status changes are blocked.
              </p>
              {activeHold && (
                <p className="text-sm text-text-secondary mt-1">
                  Reason: {activeHold.hold_reason}
                </p>
              )}
            </SpotlightCard>
          )}

          {/* Add Note */}
          <SpotlightCard className="p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3">Add Note</h3>
            <div className="flex gap-2">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-text-secondary focus:border-amber-500/50 focus:outline-none"
                placeholder="Add a note..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddNote();
                }}
              />
              <button
                onClick={handleAddNote}
                disabled={!noteText.trim()}
                className="px-4 py-2 text-sm font-medium bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 text-white disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </SpotlightCard>

          {/* Timeline */}
          <SpotlightCard className="p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-4">Timeline</h3>
            {events.length === 0 ? (
              <p className="text-sm text-text-secondary">No events yet</p>
            ) : (
              <div className="space-y-3">
                {events.map((ev) => {
                  const Icon = EVENT_ICONS[ev.event_type] ?? Clock;
                  return (
                    <div key={ev.id} className="flex items-start gap-3">
                      <div className="p-1.5 rounded bg-white/5 mt-0.5">
                        <Icon className="w-3.5 h-3.5 text-text-secondary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white capitalize">
                            {ev.event_type.replace(/_/g, ' ')}
                          </span>
                          {ev.old_value && ev.new_value && (
                            <span className="text-xs text-text-secondary">
                              {ev.old_value} → {ev.new_value}
                            </span>
                          )}
                        </div>
                        {ev.notes && (
                          <p className="text-sm text-text-secondary mt-0.5">{ev.notes}</p>
                        )}
                        <span className="text-xs text-text-secondary">
                          {new Date(ev.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SpotlightCard>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Details */}
          <SpotlightCard className="p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3">Details</h3>
            <dl className="space-y-2 text-sm">
              {wo.site_name && (
                <>
                  <dt className="text-text-secondary">Site</dt>
                  <dd className="text-white">{wo.site_name}</dd>
                </>
              )}
              {wo.outfall_display && (
                <>
                  <dt className="text-text-secondary">Outfall</dt>
                  <dd className="text-white">{wo.outfall_display}</dd>
                </>
              )}
              {wo.assigned_to_name && (
                <>
                  <dt className="text-text-secondary">Assigned To</dt>
                  <dd className="text-white">{wo.assigned_to_name}</dd>
                </>
              )}
              {wo.due_date && (
                <>
                  <dt className="text-text-secondary">Due Date</dt>
                  <dd className={clsx('text-white', isOverdue && 'text-red-400')}>{wo.due_date}</dd>
                </>
              )}
              {wo.sla_hours && (
                <>
                  <dt className="text-text-secondary">SLA</dt>
                  <dd className="text-white">{wo.sla_hours}h</dd>
                </>
              )}
              {wo.completed_at && (
                <>
                  <dt className="text-text-secondary">Completed</dt>
                  <dd className="text-white">{new Date(wo.completed_at).toLocaleDateString()}</dd>
                </>
              )}
              {wo.verified_at && (
                <>
                  <dt className="text-text-secondary">Verified</dt>
                  <dd className="text-white">{new Date(wo.verified_at).toLocaleDateString()}</dd>
                </>
              )}
              {wo.is_recurring && (
                <>
                  <dt className="text-text-secondary">Recurrence</dt>
                  <dd className="text-amber-300">Recurring ({wo.recurrence_count} prior)</dd>
                </>
              )}
              <dt className="text-text-secondary">Created</dt>
              <dd className="text-white">{new Date(wo.created_at).toLocaleDateString()}</dd>
            </dl>
          </SpotlightCard>

          {/* Legal Hold */}
          <SpotlightCard className="p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3">Legal Hold</h3>
            {isHeld ? (
              <div className="text-sm text-red-300">
                <Shield className="w-4 h-4 inline mr-1" />
                Active hold
              </div>
            ) : showHoldForm ? (
              <div className="space-y-2">
                <textarea
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-text-secondary focus:border-red-500/50 focus:outline-none resize-none"
                  placeholder="Reason for legal hold..."
                />
                <div className="flex gap-2">
                  <button
                    onClick={handlePlaceHold}
                    disabled={!holdReason.trim()}
                    className="px-3 py-1.5 text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/30 rounded hover:bg-red-500/30 disabled:opacity-40"
                  >
                    Place Hold
                  </button>
                  <button
                    onClick={() => setShowHoldForm(false)}
                    className="px-3 py-1.5 text-xs text-text-secondary hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowHoldForm(true)}
                className="text-sm text-text-secondary hover:text-red-300 transition-colors"
              >
                Place legal hold...
              </button>
            )}
          </SpotlightCard>
        </div>
      </div>
    </div>
  );
}

export default WorkOrderDetailPage;
