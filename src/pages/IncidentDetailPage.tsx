import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  AlertOctagon,
  ArrowLeft,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  MessageSquare,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { useIncidents } from '@/hooks/useIncidents';
import {
  SEVERITY_COLORS,
  STATUS_COLORS,
  CATEGORY_LABELS,
  RECOVERABILITY_LABELS,
} from '@/types/incidents';
import { CreateCAFromIncident } from '@/components/incidents/CreateCAFromIncident';
import type {
  Incident,
  IncidentEvent,
  IncidentType,
  EscalationChainStep,
} from '@/types/incidents';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function countdownDisplay(expiresAt: string | null, paused: boolean): string | null {
  if (!expiresAt || paused) return paused ? 'Paused' : null;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return 'EXPIRED';
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h ${mins}m`;
  return `${hours}h ${mins}m`;
}

export function IncidentDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { incidents, incidentTypes, fetchEvents, escalateIncident, resolveIncident } = useIncidents();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [type, setType] = useState<IncidentType | null>(null);
  const [events, setEvents] = useState<IncidentEvent[]>([]);
  const [chainSteps, setChainSteps] = useState<EscalationChainStep[]>([]);
  const [loading, setLoading] = useState(true);

  const [escalateNotes, setEscalateNotes] = useState('');
  const [resolveNotes, setResolveNotes] = useState('');
  const [showResolve, setShowResolve] = useState(false);
  const [acting, setActing] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!id) return;

    // Find in memory first
    const found = incidents.find((i) => i.id === id);
    if (found) {
      setIncident(found);
      const foundType = incidentTypes.find((t) => t.id === found.incident_type_id);
      setType(foundType ?? null);
    } else {
      // Fetch directly
      const { data } = await supabase.from('incidents').select('*').eq('id', id).single();
      if (data) {
        const inc = data as Incident;
        setIncident(inc);
        const { data: typeData } = await supabase.from('incident_types').select('*').eq('id', inc.incident_type_id).single();
        setType(typeData as IncidentType | null);
      }
    }

    // Fetch events
    const evts = await fetchEvents(id);
    setEvents(evts);

    setLoading(false);
  }, [id, incidents, incidentTypes, fetchEvents]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Fetch escalation chain steps
  useEffect(() => {
    if (!type) return;
    const chainId = incident?.active_chain_type === 'compliance'
      ? type.compliance_chain_id
      : type.operational_chain_id;
    if (!chainId) return;

    supabase
      .from('escalation_chain_steps')
      .select('*')
      .eq('chain_id', chainId)
      .order('step_number', { ascending: true })
      .then(({ data }) => {
        setChainSteps((data ?? []) as EscalationChainStep[]);
      });
  }, [type, incident?.active_chain_type]);

  async function handleEscalate() {
    if (!id) return;
    setActing(true);
    await escalateIncident(id, escalateNotes || undefined);
    setEscalateNotes('');
    await loadDetail();
    setActing(false);
  }

  async function handleResolve() {
    if (!id || !resolveNotes.trim()) return;
    setActing(true);
    await resolveIncident(id, resolveNotes.trim());
    setResolveNotes('');
    setShowResolve(false);
    await loadDetail();
    setActing(false);
  }

  if (loading || !incident) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const sevColors = SEVERITY_COLORS[incident.severity];
  const statusColors = STATUS_COLORS[incident.status];
  const countdown = countdownDisplay(incident.countdown_expires_at, incident.countdown_paused);
  const isExpired = countdown === 'EXPIRED';
  const isClosed = incident.status === 'closed' || incident.status === 'closed_no_action';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back link */}
      <Link
        to="/incidents"
        className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        <ArrowLeft size={12} />
        All Incidents
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={cn(
          'inline-flex rounded-xl p-2.5 border',
          sevColors.bg, sevColors.border,
        )}>
          <AlertOctagon className={cn('h-6 w-6', sevColors.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              {incident.title}
            </h1>
            <span className="text-xs text-text-muted">#{incident.incident_number}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {type && (
              <span className="text-xs text-text-muted">
                {CATEGORY_LABELS[type.category]} · {type.name}
              </span>
            )}
            <span className={cn(
              'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase border',
              sevColors.bg, sevColors.border, sevColors.text,
            )}>
              {incident.severity}
            </span>
            <span className={cn(
              'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase border',
              statusColors.bg, statusColors.border, statusColors.text,
            )}>
              {incident.status.replace('_', ' ')}
            </span>
            <span className={cn('text-xs font-medium', RECOVERABILITY_LABELS[incident.recoverability].color)}>
              {RECOVERABILITY_LABELS[incident.recoverability].label}
            </span>
          </div>
        </div>
      </div>

      {/* Countdown */}
      {countdown && (
        <div className={cn(
          'flex items-center gap-2 rounded-xl border px-4 py-3',
          isExpired
            ? 'border-red-500/30 bg-red-500/[0.05] animate-pulse'
            : 'border-amber-500/20 bg-amber-500/[0.03]',
        )}>
          <Clock size={18} className={isExpired ? 'text-red-400' : 'text-amber-400'} />
          <span className={cn('text-sm font-mono font-bold', isExpired ? 'text-red-400' : 'text-amber-400')}>
            {countdown}
          </span>
          <span className="text-xs text-text-muted ml-2">
            {incident.countdown_reason}
          </span>
        </div>
      )}

      {/* Two columns: detail + escalation */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        {/* Left: details + description */}
        <div className="lg:col-span-2 space-y-4">
          {incident.description && (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Description</h3>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{incident.description}</p>
            </div>
          )}

          {incident.resolution_notes && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2">Resolution</h3>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{incident.resolution_notes}</p>
            </div>
          )}

          {/* Actions */}
          {!isClosed && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleEscalate}
                disabled={acting}
                className="flex items-center gap-1.5 rounded-lg bg-orange-500/15 px-4 py-2 text-sm font-medium text-orange-300 hover:bg-orange-500/25 disabled:opacity-50 transition-colors"
              >
                <ArrowUpRight size={14} />
                Escalate
              </button>
              <button
                onClick={() => setShowResolve(!showResolve)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors"
              >
                <CheckCircle2 size={14} />
                Resolve
              </button>
              <CreateCAFromIncident
                incident={incident}
                onCreated={() => loadDetail()}
              />
            </div>
          )}

          {/* Linked CA (when closed or CA exists) */}
          {isClosed && incident.corrective_action_id && (
            <CreateCAFromIncident
              incident={incident}
              onCreated={() => loadDetail()}
            />
          )}

          {showResolve && (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
              <textarea
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                placeholder="Resolution notes (required)"
                rows={3}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-cyan-400/30"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleResolve}
                  disabled={!resolveNotes.trim() || acting}
                  className="rounded-lg bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
                >
                  Confirm Resolution
                </button>
                <button
                  onClick={() => setShowResolve(false)}
                  className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Event timeline */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02]">
            <div className="border-b border-white/[0.06] px-4 py-3">
              <h3 className="text-sm font-semibold text-text-primary">
                Timeline
                <span className="ml-2 text-xs font-normal text-text-muted">{events.length} events</span>
              </h3>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {events.map((event) => (
                <div key={event.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={12} className="text-text-muted shrink-0" />
                    <span className="text-xs font-medium text-text-secondary">
                      {event.event_type.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] text-text-muted">
                      {event.actor_name} · {timeAgo(event.created_at)}
                    </span>
                  </div>
                  {event.notes && (
                    <p className="mt-1 ml-5 text-xs text-text-muted">{event.notes}</p>
                  )}
                  {event.old_value && event.new_value && (
                    <p className="mt-0.5 ml-5 text-[11px] text-text-muted">
                      {event.old_value} → {event.new_value}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: escalation chain tracker */}
        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={14} className="text-text-muted" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                {incident.active_chain_type === 'compliance' ? 'Compliance' : 'Operational'} Chain
              </h3>
            </div>
            <div className="space-y-0">
              {chainSteps.map((step, idx) => {
                const isCurrentStep = step.step_number === incident.current_escalation_step;
                const isPast = step.step_number < incident.current_escalation_step;
                return (
                  <div key={step.id} className="relative flex items-start gap-3 pb-4 last:pb-0">
                    {/* Connector line */}
                    {idx < chainSteps.length - 1 && (
                      <div className={cn(
                        'absolute left-[11px] top-6 h-full w-0.5',
                        isPast ? 'bg-emerald-500/30' : 'bg-white/[0.08]',
                      )} />
                    )}
                    {/* Step dot */}
                    <div className={cn(
                      'relative z-10 mt-0.5 h-6 w-6 shrink-0 rounded-full border-2 flex items-center justify-center',
                      isCurrentStep
                        ? 'border-cyan-400 bg-cyan-500/20'
                        : isPast
                          ? 'border-emerald-400 bg-emerald-500/20'
                          : 'border-white/[0.15] bg-white/[0.03]',
                    )}>
                      <span className={cn(
                        'text-[9px] font-bold',
                        isCurrentStep ? 'text-cyan-300' : isPast ? 'text-emerald-400' : 'text-text-muted',
                      )}>
                        {step.step_number}
                      </span>
                    </div>
                    {/* Step content */}
                    <div>
                      <p className={cn(
                        'text-xs font-medium',
                        isCurrentStep ? 'text-cyan-300' : isPast ? 'text-emerald-400' : 'text-text-muted',
                      )}>
                        {step.owner_name}
                      </p>
                      <p className="text-[10px] text-text-muted">{step.owner_role}</p>
                      <p className="text-[10px] text-text-muted">SLA: {step.sla_hours}h</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Metadata */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Details</h3>
            <div className="text-xs text-text-muted space-y-1">
              <p>Reported: {new Date(incident.reported_at).toLocaleString()}</p>
              {incident.resolved_at && (
                <p>Resolved: {new Date(incident.resolved_at).toLocaleString()}</p>
              )}
              {incident.decree_paragraphs.length > 0 && (
                <p>Decree ¶: {incident.decree_paragraphs.join(', ')}</p>
              )}
              <p>Classification: {incident.classification_level.replace('_', ' ')}</p>
              {incident.auto_ca_triggered && incident.corrective_action_id && (
                <p>
                  <Link to={`/corrective-actions/${incident.corrective_action_id}`} className="text-cyan-400 hover:underline">
                    View Corrective Action →
                  </Link>
                </p>
              )}
              {incident.auto_ca_triggered && !incident.corrective_action_id && (
                <p className="text-amber-400">Auto-CA pending</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default IncidentDetailPage;
