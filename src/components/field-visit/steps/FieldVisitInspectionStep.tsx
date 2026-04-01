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

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
            Flow status <span className="text-cyan-200/90">(required before complete)</span>
          </span>
          <select
            value={inspection.flow_status ?? 'unknown'}
            onChange={(event) => onInspectionChange({ flow_status: event.target.value as OutletInspectionRecord['flow_status'] })}
            disabled={visitLocked}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
          >
            <option value="unknown">Unknown</option>
            <option value="flowing">Flowing</option>
            <option value="no_flow">No flow</option>
            <option value="obstructed">Obstructed</option>
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">Signage condition</span>
          <select
            value={inspection.signage_condition ?? ''}
            onChange={(event) => onInspectionChange({ signage_condition: event.target.value || null })}
            disabled={visitLocked}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
          >
            <option value="">Select signage status</option>
            {SIGNAGE_CONDITION_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">Pipe condition</span>
          <select
            value={inspection.pipe_condition ?? ''}
            onChange={(event) => onInspectionChange({ pipe_condition: event.target.value || null })}
            disabled={visitLocked}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
          >
            <option value="">Select pipe status</option>
            {PIPE_CONDITION_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">Obstruction type</span>
          <select
            value={obstruction.type}
            onChange={(event) =>
              onInspectionChange({
                obstruction_details: formatInspectionObstructionDetails(event.target.value as typeof obstruction.type, obstruction.details) || null,
              })}
            disabled={visitLocked}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
          >
            <option value="">Select obstruction type</option>
            {OBSTRUCTION_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
            Obstruction details {outletInspectionObstructed ? '(required)' : '(required if obstructed)'}
          </span>
          <textarea
            value={obstruction.details}
            onChange={(event) =>
              onInspectionChange({
                obstruction_details: formatInspectionObstructionDetails(obstruction.type, event.target.value) || null,
              })}
            disabled={visitLocked}
            rows={3}
            placeholder="Describe what is blocking or impairing the outlet and what follow-up is likely needed."
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-text-secondary">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={inspection.erosion_observed ?? false}
            onChange={(event) => onInspectionChange({ erosion_observed: event.target.checked })}
            disabled={visitLocked}
          />
          Erosion observed
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={inspection.obstruction_observed ?? false}
            onChange={(event) => onInspectionChange({ obstruction_observed: event.target.checked })}
            disabled={visitLocked}
          />
          Obstruction observed
        </label>
      </div>

      {sameAsLastHelpers}
      {deficiencyPrompts}

      <label className="block space-y-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">Inspection notes</span>
        <textarea
          value={inspection.inspector_notes ?? ''}
          onChange={(event) => onInspectionChange({ inspector_notes: event.target.value })}
          rows={3}
          disabled={visitLocked}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
        />
      </label>
    </div>
  );
}
