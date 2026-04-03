import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertOctagon,
  Plus,
  Clock,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useIncidents } from '@/hooks/useIncidents';
import {
  SEVERITY_COLORS,
  STATUS_COLORS,
  CATEGORY_LABELS,
  RECOVERABILITY_LABELS,
} from '@/types/incidents';
import type { IncidentSeverity, IncidentStatus, IncidentCategory } from '@/types/incidents';

type StatusFilter = 'active' | 'closed' | 'all';

const ACTIVE_STATUSES: IncidentStatus[] = ['open', 'investigating', 'escalated', 'pending_action', 'action_taken', 'monitoring'];

function countdownDisplay(expiresAt: string | null, paused: boolean): string | null {
  if (!expiresAt || paused) return null;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return 'EXPIRED';
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${mins}m`;
}

export function IncidentsPage() {
  const { incidents, incidentTypes, loading, createIncident } = useIncidents();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [categoryFilter, setCategoryFilter] = useState<IncidentCategory | 'all'>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create form state
  const [newTypeCode, setNewTypeCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSeverity, setNewSeverity] = useState<IncidentSeverity | ''>('');
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    let list = incidents;
    if (statusFilter === 'active') {
      list = list.filter((i) => ACTIVE_STATUSES.includes(i.status));
    } else if (statusFilter === 'closed') {
      list = list.filter((i) => i.status === 'closed' || i.status === 'closed_no_action');
    }
    if (categoryFilter !== 'all') {
      const typeIds = incidentTypes.filter((t) => t.category === categoryFilter).map((t) => t.id);
      list = list.filter((i) => typeIds.includes(i.incident_type_id));
    }
    return list;
  }, [incidents, statusFilter, categoryFilter, incidentTypes]);

  const criticalCount = incidents.filter(
    (i) => i.severity === 'critical' && ACTIVE_STATUSES.includes(i.status),
  ).length;
  const activeCount = incidents.filter((i) => ACTIVE_STATUSES.includes(i.status)).length;
  const countdownActive = incidents.filter(
    (i) => i.countdown_expires_at && !i.countdown_paused && ACTIVE_STATUSES.includes(i.status),
  ).length;

  async function handleCreate() {
    if (!newTypeCode || !newTitle.trim()) return;
    setCreating(true);
    const id = await createIncident({
      typeCode: newTypeCode,
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      severity: newSeverity || undefined,
    });
    setCreating(false);
    if (id) {
      setShowCreateForm(false);
      setNewTypeCode('');
      setNewTitle('');
      setNewDescription('');
      setNewSeverity('');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="inline-flex rounded-xl bg-red-500/10 p-2.5">
          <AlertOctagon className="h-6 w-6 text-red-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Incidents
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Track, escalate, and resolve compliance and operational incidents with countdown clocks and dual escalation chains.
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-1.5 rounded-xl bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/25 transition-colors"
        >
          <Plus size={16} />
          Report Incident
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <span className="text-xs text-text-muted">Active</span>
          <p className="text-2xl font-bold text-text-primary">{activeCount}</p>
        </div>
        <div className={cn(
          'rounded-xl border px-4 py-3',
          criticalCount > 0
            ? 'border-red-500/20 bg-red-500/[0.03]'
            : 'border-white/[0.08] bg-white/[0.02]',
        )}>
          <span className="text-xs text-text-muted">Critical</span>
          <p className={cn('text-2xl font-bold', criticalCount > 0 ? 'text-red-400' : 'text-text-primary')}>
            {criticalCount}
          </p>
        </div>
        <div className={cn(
          'rounded-xl border px-4 py-3',
          countdownActive > 0
            ? 'border-amber-500/20 bg-amber-500/[0.03]'
            : 'border-white/[0.08] bg-white/[0.02]',
        )}>
          <span className="text-xs text-text-muted">Countdown Active</span>
          <p className={cn('text-2xl font-bold', countdownActive > 0 ? 'text-amber-400' : 'text-text-primary')}>
            {countdownActive}
          </p>
        </div>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <SpotlightCard spotlightColor="rgba(239, 68, 68, 0.08)" className="p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">Report New Incident</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              value={newTypeCode}
              onChange={(e) => setNewTypeCode(e.target.value)}
              aria-label="Incident type"
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none focus:border-cyan-400/30"
            >
              <option value="">Select incident type</option>
              {incidentTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  [{CATEGORY_LABELS[t.category]}] {t.name}
                </option>
              ))}
            </select>
            <select
              value={newSeverity}
              onChange={(e) => setNewSeverity(e.target.value as IncidentSeverity | '')}
              aria-label="Severity"
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none focus:border-cyan-400/30"
            >
              <option value="">Default severity</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <input
            type="text"
            placeholder="Incident title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-cyan-400/30"
          />
          <textarea
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-cyan-400/30"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newTypeCode || !newTitle.trim() || creating}
              className="rounded-lg bg-red-500/15 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/25 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating…' : 'Report'}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </SpotlightCard>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter size={14} className="text-text-muted" />
        {(['active', 'closed', 'all'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              statusFilter === key
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]',
            )}
          >
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </button>
        ))}
        <div className="w-px h-4 bg-white/[0.08] mx-1" />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as IncidentCategory | 'all')}
          aria-label="Filter by category"
          className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-xs text-text-secondary outline-none"
        >
          <option value="all">All categories</option>
          {(Object.keys(CATEGORY_LABELS) as IncidentCategory[]).map((cat) => (
            <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
          ))}
        </select>
      </div>

      {/* Incident list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-12 text-center text-sm text-text-muted">
            {statusFilter === 'active'
              ? 'No active incidents.'
              : statusFilter === 'closed'
                ? 'No closed incidents.'
                : 'No incidents found.'}
          </div>
        ) : (
          filtered.map((incident) => {
            const type = incidentTypes.find((t) => t.id === incident.incident_type_id);
            const sevColors = SEVERITY_COLORS[incident.severity];
            const statusColors = STATUS_COLORS[incident.status];
            const countdown = countdownDisplay(incident.countdown_expires_at, incident.countdown_paused);
            const isExpired = countdown === 'EXPIRED';

            return (
              <Link
                key={incident.id}
                to={`/incidents/${incident.id}`}
                className="group flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 transition-colors hover:bg-white/[0.04]"
              >
                {/* Severity indicator */}
                <div className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                  sevColors.bg, sevColors.border,
                )}>
                  <span className={cn('text-xs font-bold uppercase', sevColors.text)}>
                    {incident.severity.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">
                      {incident.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-text-muted">
                      #{incident.incident_number}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {type && (
                      <span className="text-[11px] text-text-muted">{type.name}</span>
                    )}
                    <span className="text-[11px] text-text-muted">
                      · Step {incident.current_escalation_step}
                      {incident.current_owner_name && `: ${incident.current_owner_name}`}
                    </span>
                  </div>
                </div>

                {/* Countdown */}
                {countdown && (
                  <div className={cn(
                    'flex items-center gap-1 shrink-0 rounded-lg px-2 py-1 border text-xs font-mono font-bold',
                    isExpired
                      ? 'border-red-500/30 bg-red-500/10 text-red-400 animate-pulse'
                      : 'border-amber-500/20 bg-amber-500/[0.05] text-amber-400',
                  )}>
                    <Clock size={12} />
                    {countdown}
                  </div>
                )}

                {/* Status badge */}
                <span className={cn(
                  'shrink-0 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase border',
                  statusColors.bg, statusColors.border, statusColors.text,
                )}>
                  {incident.status.replace('_', ' ')}
                </span>

                {/* Recoverability */}
                <span className={cn(
                  'shrink-0 text-[10px] font-medium',
                  RECOVERABILITY_LABELS[incident.recoverability].color,
                )}>
                  {RECOVERABILITY_LABELS[incident.recoverability].label.split('-')[0]}
                </span>

                <ArrowUpRight size={14} className="shrink-0 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

export default IncidentsPage;
