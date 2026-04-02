import type { OutletInspectionRecord } from '@/types';
import type { ReactNode } from 'react';
import {
  OBSTRUCTION_TYPE_OPTIONS,
  PIPE_CONDITION_OPTIONS,
  SIGNAGE_CONDITION_OPTIONS,
  formatInspectionObstructionDetails,
  parseInspectionObstructionDetails,
} from '@/lib/fieldVisitInspectionRouting';

interface FieldVisitInspectionStepProps {
  inspection: Partial<OutletInspectionRecord>;
  outletInspectionObstructed: boolean;
  visitLocked: boolean;
  onInspectionChange: (patch: Partial<OutletInspectionRecord>) => void;
  sameAsLastHelpers?: ReactNode;
  deficiencyPrompts?: ReactNode;
}

export function FieldVisitInspectionStep({
  inspection,
  outletInspectionObstructed,
  visitLocked,
  onInspectionChange,
  sameAsLastHelpers,
  deficiencyPrompts,
}: FieldVisitInspectionStepProps) {
  const obstruction = parseInspectionObstructionDetails(inspection.obstruction_details);
  const obstructionActive = inspection.obstruction_observed ?? false;

  function handleObstructionToggle(observed: boolean) {
    if (observed) {
      onInspectionChange({ obstruction_observed: true });
    } else {
      onInspectionChange({
        obstruction_observed: false,
        obstruction_details: null,
      });
    }
  }

  return (
    <div className="space-y-5">
      {/* Obstruction gate — asked first */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-text-muted">
          Is there an obstruction at the outlet?
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleObstructionToggle(false)}
            disabled={visitLocked}
            className={`min-h-12 rounded-2xl border text-base font-medium transition-colors ${
              !obstructionActive
                ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-100'
                : 'border-white/[0.08] bg-white/[0.03] text-text-secondary hover:bg-white/[0.06]'
            } disabled:opacity-60`}
          >
            No
          </button>
          <button
            type="button"
            onClick={() => handleObstructionToggle(true)}
            disabled={visitLocked}
            className={`min-h-12 rounded-2xl border text-base font-medium transition-colors ${
              obstructionActive
                ? 'border-amber-500/30 bg-amber-500/15 text-amber-100'
                : 'border-white/[0.08] bg-white/[0.03] text-text-secondary hover:bg-white/[0.06]'
            } disabled:opacity-60`}
          >
            Yes
          </button>
        </div>
      </fieldset>

      {/* Obstruction details — only when obstruction is observed */}
      {obstructionActive && (
        <div className="space-y-3 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-amber-200/80">Obstruction type</span>
            <select
              value={obstruction.type}
              onChange={(event) =>
                onInspectionChange({
                  obstruction_details: formatInspectionObstructionDetails(
                    event.target.value as typeof obstruction.type,
                    obstruction.details,
                  ) || null,
                })}
              disabled={visitLocked}
              className="w-full min-h-11 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-text-primary outline-none"
            >
              <option value="">Select type</option>
              {OBSTRUCTION_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-amber-200/80">
              Describe the obstruction {outletInspectionObstructed ? <span className="text-cyan-200/90">(required)</span> : null}
            </span>
            <textarea
              value={obstruction.details}
              onChange={(event) =>
                onInspectionChange({
                  obstruction_details: formatInspectionObstructionDetails(
                    obstruction.type,
                    event.target.value,
                  ) || null,
                })}
              disabled={visitLocked}
              rows={2}
              placeholder="What is blocking or impairing the outlet?"
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none"
            />
          </label>
        </div>
      )}

      {/* Outlet inspection fields */}
      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-text-muted">
            Flow status <span className="text-cyan-200/90">(required)</span>
          </span>
          <select
            value={inspection.flow_status ?? 'unknown'}
            onChange={(event) =>
              onInspectionChange({ flow_status: event.target.value as OutletInspectionRecord['flow_status'] })}
            disabled={visitLocked}
            className="w-full min-h-12 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-base text-text-primary outline-none"
          >
            <option value="unknown">Select flow status</option>
            <option value="flowing">Flowing</option>
            <option value="no_flow">No flow</option>
            <option value="obstructed">Obstructed</option>
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-text-muted">Signage condition</span>
          <select
            value={inspection.signage_condition ?? ''}
            onChange={(event) => onInspectionChange({ signage_condition: event.target.value || null })}
            disabled={visitLocked}
            className="w-full min-h-12 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-base text-text-primary outline-none"
          >
            <option value="">Select signage status</option>
            {SIGNAGE_CONDITION_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-text-muted">Pipe condition</span>
          <select
            value={inspection.pipe_condition ?? ''}
            onChange={(event) => onInspectionChange({ pipe_condition: event.target.value || null })}
            disabled={visitLocked}
            className="w-full min-h-12 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-base text-text-primary outline-none"
          >
            <option value="">Select pipe status</option>
            {PIPE_CONDITION_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Erosion toggle */}
      <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={inspection.erosion_observed ?? false}
          onChange={(event) => onInspectionChange({ erosion_observed: event.target.checked })}
          disabled={visitLocked}
          className="h-5 w-5"
        />
        Erosion observed
      </label>

      {sameAsLastHelpers}
      {deficiencyPrompts}

      {/* Notes */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-text-muted">Inspection notes</span>
        <textarea
          value={inspection.inspector_notes ?? ''}
          onChange={(event) => onInspectionChange({ inspector_notes: event.target.value })}
          rows={2}
          disabled={visitLocked}
          placeholder="Any additional observations about the outlet condition"
          className="w-full resize-none rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none"
        />
      </label>
    </div>
  );
}
