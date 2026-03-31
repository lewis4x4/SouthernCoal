import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock3, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { usePermissions } from '@/hooks/usePermissions';
import { useGovernanceIssues, type GovernanceInboxFilter } from '@/hooks/useGovernanceIssues';
import { cn } from '@/lib/cn';
import { governanceInboxUrgentLine, type GovernanceDeadlineTone } from '@/lib/governanceDeadlines';
import type { GovernanceIssueStatus } from '@/types';
const EDIT_ROLES = ['environmental_manager', 'admin'];

const STATUS_OPTIONS: GovernanceIssueStatus[] = [
  'open',
  'under_review',
  'decision_recorded',
  'closed',
];

function formatDeadline(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function inboxUrgentClass(tone: GovernanceDeadlineTone) {
  switch (tone) {
    case 'overdue':
      return 'text-red-300';
    case 'soon':
      return 'text-amber-200';
    case 'ok':
      return 'text-emerald-200/90';
    default:
      return 'text-text-muted';
  }
}

export function GovernanceIssuesPage() {
  const { getEffectiveRole } = usePermissions();
  const role = getEffectiveRole();
  const canEdit = EDIT_ROLES.includes(role);

  const { issues, events, loading, loadEvents, updateIssue, inboxFilter, setInboxFilter } =
    useGovernanceIssues();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<GovernanceIssueStatus>('open');
  const [finalDisposition, setFinalDisposition] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedId && issues.length > 0) {
      setSelectedId(issues[0]?.id ?? null);
    }
  }, [issues, selectedId]);

  useEffect(() => {
    if (selectedId && issues.length > 0 && !issues.some((i) => i.id === selectedId)) {
      setSelectedId(issues[0]?.id ?? null);
    }
    if (selectedId && issues.length === 0) {
      setSelectedId(null);
    }
  }, [issues, selectedId]);

  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.id === selectedId) ?? null,
    [issues, selectedId],
  );

  useEffect(() => {
    if (!selectedIssue) return;
    setStatus(selectedIssue.current_status);
    setFinalDisposition(selectedIssue.final_disposition ?? '');
    setNotes('');
    loadEvents(selectedIssue.id).catch((error) => {
      console.error('[GovernanceIssuesPage] Failed to load events:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load issue events');
    });
  }, [loadEvents, selectedIssue]);

  async function handleSave() {
    if (!selectedIssue) return;

    try {
      setSaving(true);
      await updateIssue(selectedIssue, {
        currentStatus: status,
        finalDisposition,
        notes,
      });
      toast.success('Governance issue updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update governance issue');
    } finally {
      setSaving(false);
    }
  }

  const inboxDescriptions: Record<GovernanceInboxFilter, string> = {
    bill_primary: 'Step 1 issues owned by Bill Johnson (decree escalation entry point).',
    all_open: 'Every open or in-review issue in your organization.',
    escalated: 'Step 2+ (past initial review — Tom Lusk, executive, or counsel track).',
  };

  const inboxTabs: { id: GovernanceInboxFilter; label: string }[] = [
    { id: 'bill_primary', label: 'Bill · step 1' },
    { id: 'all_open', label: 'All open' },
    { id: 'escalated', label: 'Escalated' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            Governance Inbox
          </h1>
          <p className="mt-1 text-sm text-text-secondary">{inboxDescriptions[inboxFilter]}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {inboxTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setInboxFilter(tab.id)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  inboxFilter === tab.id
                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                    : 'border-white/[0.08] bg-white/[0.03] text-text-secondary hover:bg-white/[0.06]',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-amber-500/10 p-3">
          <FileWarning className="h-6 w-6 text-amber-300" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <SpotlightCard className="p-4">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              Open Issues
            </h2>
          </div>

          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]" />
              ))
            ) : issues.length === 0 ? (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-sm text-text-muted">
                No governance issues are currently queued.
              </div>
            ) : (
              issues.map((issue) => {
                const urgent = governanceInboxUrgentLine({
                  response_deadline: issue.response_deadline,
                  notice_deadline: issue.notice_deadline,
                  written_deadline: issue.written_deadline,
                });
                return (
                  <button
                    key={issue.id}
                    onClick={() => setSelectedId(issue.id)}
                    className={`w-full rounded-xl border px-4 py-4 text-left transition-colors ${
                      issue.id === selectedId
                        ? 'border-amber-500/30 bg-amber-500/10'
                        : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-text-primary">{issue.title}</div>
                        <div className="mt-1 text-xs text-text-muted">
                          {issue.issue_type.replace('_', ' ')} · Step {issue.current_step}
                        </div>
                      </div>
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-secondary">
                        {issue.current_status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
                      <Clock3 className="h-3.5 w-3.5 shrink-0" />
                      <span>Owner: {issue.current_owner_name}</span>
                    </div>
                    {urgent.text ? (
                      <div className={`mt-2 text-xs font-medium ${inboxUrgentClass(urgent.tone)}`}>
                        {urgent.text}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-text-muted">No deadlines on record</div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </SpotlightCard>

        <SpotlightCard className="p-6">
          {!selectedIssue ? (
            <p className="text-sm text-text-muted">Select a governance issue to review.</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">{selectedIssue.title}</h2>
                  <p className="mt-1 text-sm text-text-secondary">{selectedIssue.issue_summary}</p>
                </div>
                <Link
                  to={selectedIssue.field_visit_id ? `/field/visits/${selectedIssue.field_visit_id}` : '/field/dispatch'}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary"
                >
                  Open source visit
                </Link>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm">
                  <div className="text-text-muted">Current owner</div>
                  <div className="mt-1 font-medium text-text-primary">{selectedIssue.current_owner_name}</div>
                  <div className="mt-1 text-xs text-text-muted">{selectedIssue.current_owner_role}</div>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm">
                  <div className="text-text-muted">Decree references</div>
                  <div className="mt-1 font-medium text-text-primary">
                    {selectedIssue.decree_paragraphs.length > 0 ? selectedIssue.decree_paragraphs.join(', ') : '—'}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm">
                  <div className="text-text-muted">Raised</div>
                  <div className="mt-1 font-medium text-text-primary">{formatDeadline(selectedIssue.raised_at)}</div>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm">
                  <div className="text-text-muted">Response deadline</div>
                  <div className="mt-1 font-medium text-text-primary">{formatDeadline(selectedIssue.response_deadline)}</div>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm">
                  <div className="text-text-muted">Notice / written deadlines</div>
                  <div className="mt-1 font-medium text-text-primary">
                    {formatDeadline(selectedIssue.notice_deadline)} / {formatDeadline(selectedIssue.written_deadline)}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">Status</span>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as GovernanceIssueStatus)}
                    disabled={!canEdit}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
                  >
                    {STATUS_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">Final disposition</span>
                  <input
                    value={finalDisposition}
                    onChange={(e) => setFinalDisposition(e.target.value)}
                    disabled={!canEdit}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
                  />
                </label>
              </div>

              <label className="mt-4 block space-y-2">
                <span className="text-xs font-medium text-text-muted">Decision / review note</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  disabled={!canEdit}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
                />
              </label>

              {!canEdit && (
                <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-text-secondary">
                  This queue is visible for oversight. Governance updates are limited to designated operators.
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving || !canEdit}
                className="mt-4 rounded-xl bg-amber-500/15 px-4 py-2.5 text-sm font-medium text-amber-200 transition-colors hover:bg-amber-500/25 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Record governance update'}
              </button>

              <div className="mt-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                  Issue events
                </h3>
                <div className="mt-3 space-y-3">
                  {(events[selectedIssue.id] ?? []).map((event) => (
                    <div key={event.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-text-primary">{event.event_type.replace('_', ' ')}</div>
                        <div className="text-xs text-text-muted">{new Date(event.created_at).toLocaleString()}</div>
                      </div>
                      {(event.from_status || event.to_status) && (
                        <div className="mt-1 text-xs text-text-muted">
                          {event.from_status ?? '—'} → {event.to_status ?? '—'}
                        </div>
                      )}
                      {event.notes && (
                        <div className="mt-2 text-sm text-text-secondary">{event.notes}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </SpotlightCard>
      </div>
    </div>
  );
}
