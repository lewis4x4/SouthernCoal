import { History } from 'lucide-react';
import { SubmissionEvidenceViewer } from '@/components/submissions/SubmissionEvidenceViewer';
import type { FieldVisitPreviousContext } from '@/types';

interface FieldVisitLastContextCardProps {
  context: FieldVisitPreviousContext | null;
}

function formatOutcome(outcome: FieldVisitPreviousContext['outcome']) {
  return outcome ? outcome.replace(/_/g, ' ') : 'No recorded outcome';
}

export function FieldVisitLastContextCard({
  context,
}: FieldVisitLastContextCardProps) {
  if (!context) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-cyan-300" aria-hidden />
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
            Last Visit Context
          </h3>
        </div>
        <p className="mt-4 text-sm text-text-muted">
          No prior visit context is available yet for this outfall.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-cyan-300" aria-hidden />
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
          Last Visit Context
        </h3>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Last date</div>
          <div className="mt-2 text-sm font-medium text-text-primary">
            {new Date(`${context.scheduled_date}T00:00:00`).toLocaleDateString()}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Last outcome</div>
          <div className="mt-2 text-sm font-medium capitalize text-text-primary">
            {formatOutcome(context.outcome)}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {context.inspection_flow_status || context.signage_condition || context.pipe_condition ? (
          <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Last inspection summary</div>
            <div className="mt-2 space-y-1 text-text-secondary">
              {context.inspection_flow_status ? <div>Flow: {context.inspection_flow_status.replace(/_/g, ' ')}</div> : null}
              {context.signage_condition ? <div>Signage: {context.signage_condition}</div> : null}
              {context.pipe_condition ? <div>Pipe: {context.pipe_condition}</div> : null}
              {context.erosion_observed ? <div>Erosion was noted.</div> : null}
              {context.obstruction_observed ? <div>Obstruction was noted.</div> : null}
              {context.obstruction_details ? <div>Obstruction detail: {context.obstruction_details}</div> : null}
              {context.inspector_notes ? <div>Inspection note: {context.inspector_notes}</div> : null}
            </div>
          </div>
        ) : null}

        {context.access_issue_type ? (
          <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Last access issue</div>
            <div className="mt-2 text-text-primary">{context.access_issue_type.replace(/_/g, ' ')}</div>
            {context.access_issue_narrative ? (
              <div className="mt-2 text-text-secondary">{context.access_issue_narrative}</div>
            ) : null}
          </div>
        ) : null}

        {context.no_discharge_narrative ? (
          <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Last no-discharge note</div>
            <div className="mt-2 text-text-secondary">{context.no_discharge_narrative}</div>
          </div>
        ) : null}

        {context.field_notes ? (
          <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Last field notes</div>
            <div className="mt-2 text-text-secondary">{context.field_notes}</div>
          </div>
        ) : null}

        {context.photo_evidence_paths.length > 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Prior photo evidence</div>
            <div className="mt-3">
              <SubmissionEvidenceViewer
                bucket="field-inspections"
                paths={context.photo_evidence_paths}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
