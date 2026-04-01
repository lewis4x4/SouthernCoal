import type { ReactNode } from 'react';
import { AlertTriangle, Camera, Droplets, Package, ShieldAlert, Wind } from 'lucide-react';
import type { FieldVisitOutcome } from '@/types';

interface FieldVisitOutcomePanelProps {
  outcome: FieldVisitOutcome;
  totalPhotoCount?: number;
  pendingPhotoCount?: number;
  syncedPhotoCount?: number;
  isOnline?: boolean;
  content: ReactNode;
  evidence?: ReactNode;
  notes?: ReactNode;
}

const OUTCOME_META = {
  sample_collected: {
    icon: Package,
    eyebrow: 'Outcome Path',
    title: 'Sample collected workflow',
    description:
      'Capture custody details first, then record only on-site observations that belong in the field record.',
    bullets: [
      'Primary container ID and preservative confirmation are required before completion.',
      'On-site field measurements live here; downstream lab values do not.',
      'Photos should document the stop, collection context, and anything unusual at the outlet.',
    ],
  },
  no_discharge: {
    icon: Wind,
    eyebrow: 'Outcome Path',
    title: 'No-discharge documentation',
    description:
      'Build an audit-ready record showing what you observed, why no sample was taken, and the site conditions that support that determination.',
    bullets: [
      'Narrative and photo evidence are required for a defensible no-discharge record.',
      'Observed conditions should explain what the outlet looked like at the actual sample point.',
      'If an obstruction contributed, capture specifics so the record can be reviewed without follow-up.',
    ],
  },
  access_issue: {
    icon: ShieldAlert,
    eyebrow: 'Outcome Path',
    title: 'Access issue escalation',
    description:
      'Capture what blocked access, what you attempted, and enough evidence for routing and follow-up without reopening the stop.',
    bullets: [
      'Narrative and photo evidence are required before the stop can be completed.',
      'Issue type and contact attempts should make the next action obvious to reviewers.',
      'Use this path only when sampling could not proceed because access was blocked or unsafe.',
    ],
  },
} as const;

export function FieldVisitOutcomePanel({
  outcome,
  totalPhotoCount = 0,
  pendingPhotoCount = 0,
  syncedPhotoCount = 0,
  isOnline = false,
  content,
  evidence,
  notes,
}: FieldVisitOutcomePanelProps) {
  const meta = OUTCOME_META[outcome];
  const Icon = meta.icon;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2.5">
            <Icon className="h-5 w-5 text-cyan-200" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">{meta.eyebrow}</p>
            <h3 className="mt-2 text-lg font-semibold text-text-primary">{meta.title}</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{meta.description}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {meta.bullets.map((bullet) => (
            <div key={bullet} className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm text-text-secondary">
              {bullet}
            </div>
          ))}
        </div>
      </div>

      {content}

      {evidence ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-cyan-300" aria-hidden />
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
              Evidence
            </h3>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm text-text-secondary">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Uploaded</div>
              <div className="mt-2 text-lg font-semibold text-text-primary">{syncedPhotoCount}</div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm text-text-secondary">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Pending sync</div>
              <div className="mt-2 text-lg font-semibold text-text-primary">{pendingPhotoCount}</div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm text-text-secondary">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Total photos</div>
              <div className="mt-2 text-lg font-semibold text-text-primary">{totalPhotoCount}</div>
            </div>
          </div>
          {(outcome === 'no_discharge' || outcome === 'access_issue') && isOnline ? (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden />
              Completing online still requires at least one photo uploaded to the server. Pending device drafts do not satisfy the gate until they sync.
            </div>
          ) : null}
          {evidence}
        </div>
      ) : null}

      {notes ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="flex items-center gap-2">
            <Droplets className="h-4 w-4 text-cyan-300" aria-hidden />
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
              Operational Notes
            </h3>
          </div>
          <p className="mt-3 text-sm text-text-secondary">
            Capture anything that will help route review, explain the stop, or support downstream follow-up.
          </p>
          <div className="mt-4 space-y-4">{notes}</div>
        </div>
      ) : null}
    </div>
  );
}
