import { ArrowUpRight, CloudRain, Lock, TimerReset } from 'lucide-react';
import { describeGovernanceDeadline } from '@/lib/governanceDeadlines';
import { getForceMajeureQuickPhrases } from '@/lib/fieldVisitTemplates';
import { QuickPhrasePicker } from '@/components/field-visit/QuickPhrasePicker';
import type { FieldVisitOutcome, GovernanceIssueRecord } from '@/types';

interface FieldVisitForceMajeureAssistPanelProps {
  checked: boolean;
  notes: string;
  outcome: FieldVisitOutcome;
  disabled?: boolean;
  selectedEvidenceBucketFocused: boolean;
  existingIssue?: GovernanceIssueRecord | null;
  governanceInboxHref?: string | null;
  governanceDisabledReason?: string | null;
  onCheckedChange: (checked: boolean) => void;
  onNotesChange: (value: string) => void;
  onAppendNote: (value: string) => void;
  onReplaceNote: (value: string) => void;
  onFocusEvidence: () => void;
}

function deadlineToneClass(tone: ReturnType<typeof describeGovernanceDeadline>['tone']) {
  switch (tone) {
    case 'overdue':
      return 'text-rose-100';
    case 'soon':
      return 'text-amber-100';
    case 'ok':
      return 'text-cyan-100';
    default:
      return 'text-text-muted';
  }
}

export function FieldVisitForceMajeureAssistPanel({
  checked,
  notes,
  outcome,
  disabled = false,
  selectedEvidenceBucketFocused,
  existingIssue,
  governanceInboxHref,
  governanceDisabledReason,
  onCheckedChange,
  onNotesChange,
  onAppendNote,
  onReplaceNote,
  onFocusEvidence,
}: FieldVisitForceMajeureAssistPanelProps) {
  const response = existingIssue ? describeGovernanceDeadline(existingIssue.response_deadline) : null;
  const notice = existingIssue ? describeGovernanceDeadline(existingIssue.notice_deadline) : null;
  const written = existingIssue ? describeGovernanceDeadline(existingIssue.written_deadline) : null;

  return (
    <div
      role="region"
      aria-label="Force majeure assist"
      className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5"
    >
      <div className="flex items-center gap-2">
        <CloudRain className="h-4 w-4 text-amber-200" aria-hidden />
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-50">
          Force majeure assist
        </h3>
      </div>
      <p className="mt-2 text-sm text-amber-50/90">
        Use this when weather, access, or other extraordinary site conditions may affect notice handling or later governance review.
      </p>

      <label className="mt-4 flex items-center gap-2 text-sm font-medium text-text-primary">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          disabled={disabled}
        />
        Potential force majeure candidate
      </label>

      <div className="mt-4 rounded-xl border border-amber-500/20 bg-black/10 px-4 py-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/85">
          <TimerReset className="h-3.5 w-3.5" aria-hidden />
          Timing guidance
        </div>
        {existingIssue ? (
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-xs text-text-muted">Response</div>
              <div className={`mt-1 text-sm font-medium ${deadlineToneClass(response?.tone ?? 'empty')}`}>
                {response?.text ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Notice target</div>
              <div className={`mt-1 text-sm font-medium ${deadlineToneClass(notice?.tone ?? 'empty')}`}>
                {notice?.text ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Written target</div>
              <div className={`mt-1 text-sm font-medium ${deadlineToneClass(written?.tone ?? 'empty')}`}>
                {written?.text ?? '—'}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-text-secondary">
            If this visit becomes a force-majeure issue, notice timing starts from the completion record. Capture the timing, cause, and evidence now while the site context is still fresh.
          </p>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/10 px-4 py-4">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
          Evidence prompts
        </div>
        <div className="mt-3 grid gap-2 text-sm text-text-secondary md:grid-cols-2">
          <div>Document weather or site conditions that materially affected execution.</div>
          <div>Record when the condition was observed and who or what confirmed it.</div>
          <div>Explain why normal sampling could not proceed or why the result is impaired.</div>
          <div>Capture at least one site/weather photo if visual context supports the record.</div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={onFocusEvidence}
            className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-500/20 disabled:opacity-60"
          >
            Focus site/weather evidence
          </button>
          {selectedEvidenceBucketFocused ? (
            <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
              Site/weather bucket selected
            </span>
          ) : null}
          {governanceInboxHref ? (
            <a
              href={governanceInboxHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-white/[0.08]"
            >
              Open governance inbox
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : (
            <button
              type="button"
              disabled
              title={governanceDisabledReason ?? 'Governance inbox is not available from this role.'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-text-muted opacity-70"
            >
              Open governance inbox
              <Lock className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
        {!governanceInboxHref && governanceDisabledReason ? (
          <div className="mt-3 text-xs text-text-muted">{governanceDisabledReason}</div>
        ) : null}
      </div>

      <label className="mt-4 block space-y-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
          Force majeure notes
        </span>
        <textarea
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          rows={4}
          disabled={disabled}
          placeholder="Capture timing, source, and why the condition could affect sampling or decree notice handling."
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
        />
      </label>

      <div className="mt-4">
        <QuickPhrasePicker
          title="Force majeure quick phrases"
          description={`Seed the ${outcome.replace(/_/g, ' ')} record with timing and cause context, then edit it to the actual stop conditions.`}
          templates={getForceMajeureQuickPhrases(outcome)}
          disabled={disabled}
          onAppend={onAppendNote}
          onReplace={onReplaceNote}
        />
      </div>

      {checked ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
          This flag does not replace evidence. Make sure the narrative and photo context are strong enough for a later governance decision.
        </div>
      ) : null}
    </div>
  );
}
