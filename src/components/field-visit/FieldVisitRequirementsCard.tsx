import { ClipboardList } from 'lucide-react';
import type {
  FieldVisitRequiredMeasurement,
  FieldVisitStopRequirement,
} from '@/types';
import type { FieldVisitRequirementsModel } from '@/lib/fieldVisitRequirements';

interface FieldVisitRequirementsCardProps {
  stopRequirements: FieldVisitStopRequirement[];
  requiredMeasurements: FieldVisitRequiredMeasurement[];
  model: FieldVisitRequirementsModel;
}

export function FieldVisitRequirementsCard({
  stopRequirements,
  requiredMeasurements,
  model,
}: FieldVisitRequirementsCardProps) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-cyan-300" aria-hidden />
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
          What This Stop Requires
        </h3>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
            Scheduled sample requirements
          </div>
          <div className="mt-3 space-y-2">
            {stopRequirements.length === 0 ? (
              <div className="text-sm text-text-muted">
                No stop-specific sample requirements were available for this visit.
              </div>
            ) : (
              stopRequirements.map((requirement) => (
                <div key={requirement.calendar_id} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-3">
                  <div className="text-sm font-medium text-text-primary">{requirement.parameter_label}</div>
                  <div className="mt-1 text-xs text-text-secondary">
                    {requirement.sample_type ?? 'Sample'}{requirement.default_unit ? ` · ${requirement.default_unit}` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
            Required field measurements
          </div>
          <div className="mt-3 space-y-2">
            {requiredMeasurements.length === 0 ? (
              <div className="text-sm text-text-muted">
                This stop does not currently resolve to a field-meter reading requirement from the scheduled parameter set.
              </div>
            ) : (
              requiredMeasurements.map((measurement) => (
                <div key={measurement.key} className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.06] px-3 py-3">
                  <div className="text-sm font-medium text-text-primary">
                    {measurement.display_label}
                    {measurement.default_unit ? ` · ${measurement.default_unit}` : ''}
                  </div>
                  <div className="mt-1 text-xs text-text-secondary">
                    Driven by: {measurement.source_parameter_names.join(', ')}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
            Bottle / kit expectations
          </div>
          <div className="mt-3 space-y-2">
            {model.bottleExpectations.length === 0 ? (
              <div className="text-sm text-text-muted">
                No bottle or kit expectation could be derived yet for this stop.
              </div>
            ) : (
              model.bottleExpectations.map((expectation) => (
                <div key={expectation} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-3 text-sm text-text-primary">
                  {expectation}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
            Evidence expectations
          </div>
          <div className="mt-3 space-y-2">
            {model.requiredEvidence.map((item) => (
              <div key={item.id} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-text-primary">{item.label}</div>
                  {item.requiredNow ? (
                    <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">
                      Required now
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-text-secondary">{item.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {model.instructionLines.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/80">
            Schedule instructions
          </div>
          <div className="mt-2 space-y-2">
            {model.instructionLines.map((instruction) => (
              <p key={instruction} className="whitespace-pre-wrap text-sm text-text-primary">
                {instruction}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
