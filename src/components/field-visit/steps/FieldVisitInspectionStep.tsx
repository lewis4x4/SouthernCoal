import { AlertTriangle, Camera, CheckCircle2, ImagePlus, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type {
  FlowEstimationCategory,
  FlowEstimationMethod,
  OutletInspectionRecord,
  SiteConditionPresent,
  StandingWaterChecks,
} from '@/types';
import {
  OBSTRUCTION_TYPE_OPTIONS,
  formatInspectionObstructionDetails,
  parseInspectionObstructionDetails,
} from '@/lib/fieldVisitInspectionRouting';
import {
  clampFlowEstimateCfs,
  FLOW_CATEGORY_MIDPOINT_CFS,
  FLOW_ESTIMATION_METHOD_OPTIONS,
  parseFlowEstimateCfsInput,
  VISUAL_FLOW_CATEGORY_OPTIONS,
} from '@/lib/fieldVisitStreamFlow';

interface FieldVisitInspectionStepProps {
  inspection: Partial<OutletInspectionRecord>;
  visitLocked: boolean;
  onInspectionChange: (patch: Partial<OutletInspectionRecord>) => void;
  /** Stream / receiving-stream / GW-SW monitoring points only (from outfall type). */
  streamFlowEstimationEnabled: boolean;
  sameAsLastHelpers?: ReactNode;
  siteCondition: SiteConditionPresent | null;
  onSiteConditionChange: (condition: SiteConditionPresent | null) => void;
  standingWaterChecks: StandingWaterChecks;
  onStandingWaterChecksChange: (checks: Partial<StandingWaterChecks>) => void;
  notCollectableNotes: string;
  onNotCollectableNotesChange: (notes: string) => void;
  obstructionPhotoUpload?: ReactNode;
  obstructionPhotoCount?: number;
  conditionPhotoUpload?: ReactNode;
  conditionPhotoCount?: number;
}

const SITE_CONDITIONS: { value: SiteConditionPresent; label: string }[] = [
  { value: 'flowing_discharge', label: 'Flowing discharge' },
  { value: 'standing_water', label: 'Standing water' },
  { value: 'no_water', label: 'No water present' },
  { value: 'inaccessible', label: 'Inaccessible' },
  { value: 'other', label: 'Other' },
];

function YesNoToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        aria-pressed={value === true}
        onClick={() => onChange(true)}
        disabled={disabled}
        className={`min-h-11 rounded-xl border text-sm font-medium transition-colors ${
          value === true
            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-100'
            : 'border-white/[0.08] bg-white/[0.03] text-text-secondary hover:bg-white/[0.06]'
        } disabled:opacity-60`}
      >
        Yes
      </button>
      <button
        type="button"
        aria-pressed={value === false}
        onClick={() => onChange(false)}
        disabled={disabled}
        className={`min-h-11 rounded-xl border text-sm font-medium transition-colors ${
          value === false
            ? 'border-amber-500/30 bg-amber-500/15 text-amber-100'
            : 'border-white/[0.08] bg-white/[0.03] text-text-secondary hover:bg-white/[0.06]'
        } disabled:opacity-60`}
      >
        No
      </button>
    </div>
  );
}

export function FieldVisitInspectionStep({
  inspection,
  visitLocked,
  onInspectionChange,
  streamFlowEstimationEnabled,
  sameAsLastHelpers,
  siteCondition,
  onSiteConditionChange,
  standingWaterChecks,
  onStandingWaterChecksChange,
  notCollectableNotes,
  onNotCollectableNotesChange,
  obstructionPhotoUpload,
  obstructionPhotoCount = 0,
  conditionPhotoUpload,
  conditionPhotoCount = 0,
}: FieldVisitInspectionStepProps) {
  const obstruction = parseInspectionObstructionDetails(inspection.obstruction_details);
  const canReachSite = !(inspection.obstruction_observed ?? false);

  const isNotCollectable =
    siteCondition === 'no_water' ||
    siteCondition === 'inaccessible' ||
    siteCondition === 'other' ||
    (siteCondition === 'standing_water' && (
      standingWaterChecks.sufficientWater === false ||
      standingWaterChecks.noDisturbance === false ||
      standingWaterChecks.pointVerified === false
    ));

  const cfs = inspection.flow_estimate_cfs;
  const streamFlowEstimateDone =
    !streamFlowEstimationEnabled ||
    (inspection.flow_category != null &&
      inspection.flow_method != null &&
      typeof cfs === 'number' &&
      Number.isFinite(cfs) &&
      cfs >= 0 &&
      cfs <= 999);

  function handleReachabilityToggle(reachable: boolean) {
    if (reachable) {
      onInspectionChange({ obstruction_observed: false, obstruction_details: null });
    } else {
      onInspectionChange({ obstruction_observed: true });
      onSiteConditionChange(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Part A: Can you reach the site? */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-text-muted">
          Are you able to reach the inspection site?
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            aria-pressed={canReachSite}
            onClick={() => handleReachabilityToggle(true)}
            disabled={visitLocked}
            className={`min-h-12 rounded-2xl border text-base font-medium transition-colors ${
              canReachSite
                ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-100'
                : 'border-white/[0.08] bg-white/[0.03] text-text-secondary hover:bg-white/[0.06]'
            } disabled:opacity-60`}
          >
            Yes
          </button>
          <button
            type="button"
            aria-pressed={!canReachSite}
            onClick={() => handleReachabilityToggle(false)}
            disabled={visitLocked}
            className={`min-h-12 rounded-2xl border text-base font-medium transition-colors ${
              !canReachSite
                ? 'border-amber-500/30 bg-amber-500/15 text-amber-100'
                : 'border-white/[0.08] bg-white/[0.03] text-text-secondary hover:bg-white/[0.06]'
            } disabled:opacity-60`}
          >
            No
          </button>
        </div>
      </fieldset>

      {/* Obstruction details when site is not reachable */}
      {!canReachSite && (
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
              Describe the obstruction <span className="text-cyan-200/90">(required)</span>
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

          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <ImagePlus className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
              <span className="text-sm font-medium text-amber-200/80">
                Photo of obstruction {obstructionPhotoCount > 0 ? `(${obstructionPhotoCount} attached)` : '(optional)'}
              </span>
            </div>
            {obstructionPhotoUpload}
          </div>
        </div>
      )}

      {/* Part B: What condition is present? (only when site is reachable) */}
      {canReachSite && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-text-muted">
            What condition is present at the designated monitoring point?
          </legend>
          <div className="grid gap-2">
            {SITE_CONDITIONS.map((cond) => {
              const selected = siteCondition === cond.value;
              return (
                <button
                  key={cond.value}
                  type="button"
                  aria-pressed={selected}
                  disabled={visitLocked}
                  onClick={() => onSiteConditionChange(cond.value)}
                  className={`min-h-12 rounded-2xl border px-4 text-left text-base font-medium transition-colors ${
                    selected
                      ? 'border-cyan-400/35 bg-cyan-500/15 text-cyan-100'
                      : 'border-white/[0.06] bg-white/[0.02] text-text-secondary hover:bg-white/[0.05] active:bg-white/[0.08]'
                  } disabled:opacity-60`}
                >
                  {cond.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* Part C: Standing water sub-questions */}
      {canReachSite && siteCondition === 'standing_water' && (
        <div className="space-y-4 rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.04] p-4">
          <div className="text-sm font-medium text-cyan-200/80">Standing water verification</div>

          <div className="space-y-1.5">
            <span className="text-sm text-text-secondary">
              Was sufficient water present to collect the required sample?
            </span>
            <YesNoToggle
              value={standingWaterChecks.sufficientWater}
              onChange={(v) => onStandingWaterChecksChange({ sufficientWater: v })}
              disabled={visitLocked}
            />
          </div>

          {standingWaterChecks.sufficientWater === true && (
            <div className="space-y-1.5">
              <span className="text-sm text-text-secondary">
                Could the sample be collected without disturbing sediment?
              </span>
              <YesNoToggle
                value={standingWaterChecks.noDisturbance}
                onChange={(v) => onStandingWaterChecksChange({ noDisturbance: v })}
                disabled={visitLocked}
              />
            </div>
          )}

          {standingWaterChecks.sufficientWater === true &&
           standingWaterChecks.noDisturbance === true && (
            <div className="space-y-1.5">
              <span className="text-sm text-text-secondary">
                Was the designated monitoring point verified?
              </span>
              <YesNoToggle
                value={standingWaterChecks.pointVerified}
                onChange={(v) => onStandingWaterChecksChange({ pointVerified: v })}
                disabled={visitLocked}
              />
            </div>
          )}

          {standingWaterChecks.sufficientWater === true &&
           standingWaterChecks.noDisturbance === true &&
           standingWaterChecks.pointVerified === true && (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
              <span className="text-sm text-emerald-100">Standing water is sampleable — proceed to collection</span>
            </div>
          )}

          {(standingWaterChecks.sufficientWater === false ||
            standingWaterChecks.noDisturbance === false ||
            standingWaterChecks.pointVerified === false) && (
            <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
              <XCircle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
              <span className="text-sm text-amber-100">Sample cannot be collected — document the condition below</span>
            </div>
          )}
        </div>
      )}

      {/* Part D: Not collectable — notes + photo required */}
      {canReachSite && isNotCollectable && (
        <div className="space-y-3 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-4">
          <div className="text-sm font-medium text-amber-200/80">
            Why was the sample not collectable?
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-text-muted">
              Describe the observed condition <span className="text-cyan-200/90">(required)</span>
            </span>
            <textarea
              value={notCollectableNotes}
              onChange={(e) => onNotCollectableNotesChange(e.target.value)}
              disabled={visitLocked}
              rows={3}
              placeholder="Describe what you observed at the monitoring point"
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none"
            />
          </label>
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <Camera className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
              <span className="text-sm font-medium text-amber-200/80">
                Photo evidence {conditionPhotoCount > 0 ? `(${conditionPhotoCount} attached)` : '(required)'}
              </span>
            </div>
            {conditionPhotoUpload}
          </div>
        </div>
      )}

      {/* Visual stream flow (WV receiving-stream style) — only for applicable outfall types */}
      {canReachSite && siteCondition === 'flowing_discharge' && streamFlowEstimationEnabled && (
        <div className="space-y-4 rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.04] p-4">
          <div>
            <div className="text-sm font-medium text-cyan-100">Estimated Stream Flow</div>
            <p className="mt-1 text-xs text-text-secondary">
              Visually assess the stream and select the best match. Consider stream width, depth, and water
              velocity.
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="sr-only">Flow category</legend>
            <div className="grid gap-2">
              {VISUAL_FLOW_CATEGORY_OPTIONS.map((opt) => {
                const selected = inspection.flow_category === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={selected}
                    disabled={visitLocked}
                    onClick={() =>
                      onInspectionChange({
                        flow_category: opt.value as FlowEstimationCategory,
                        flow_estimate_cfs: FLOW_CATEGORY_MIDPOINT_CFS[opt.value],
                        flow_safety_warning_shown: opt.value === 'flood',
                      })
                    }
                    className={`min-h-12 rounded-2xl border px-4 py-3 text-left text-base font-medium transition-colors ${
                      selected
                        ? 'border-cyan-400/35 bg-cyan-500/15 text-cyan-100'
                        : 'border-white/[0.06] bg-white/[0.02] text-text-secondary hover:bg-white/[0.05] active:bg-white/[0.08]'
                    } disabled:opacity-60`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                      <span>{opt.label}</span>
                      <span className="text-xs font-normal text-text-muted">{opt.rangeLabel}</span>
                    </div>
                    <p className="mt-1 text-xs font-normal text-text-muted">{opt.description}</p>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {inspection.flow_category ? (
            <>
              {inspection.flow_category === 'flood' && (
                <div
                  className="flex gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3"
                  role="status"
                >
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" aria-hidden />
                  <p className="text-sm text-amber-100">
                    Do not enter the stream. Record visual observations and photos from a safe distance. Flow
                    estimate is approximate.
                  </p>
                </div>
              )}

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-text-muted">Estimated Flow (cfs)</span>
                <input
                  type="number"
                  min={0}
                  max={999}
                  step={0.1}
                  inputMode="decimal"
                  disabled={visitLocked}
                  value={
                    inspection.flow_estimate_cfs != null && Number.isFinite(inspection.flow_estimate_cfs)
                      ? inspection.flow_estimate_cfs
                      : ''
                  }
                  onChange={(e) => {
                    const parsed = parseFlowEstimateCfsInput(e.target.value);
                    onInspectionChange({
                      flow_estimate_cfs: parsed == null ? null : clampFlowEstimateCfs(parsed),
                    });
                  }}
                  placeholder={String(FLOW_CATEGORY_MIDPOINT_CFS[inspection.flow_category])}
                  className="w-full min-h-11 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none"
                />
              </label>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-text-muted">Estimation Method</legend>
                <div className="flex flex-wrap gap-2">
                  {FLOW_ESTIMATION_METHOD_OPTIONS.map((opt) => {
                    const selected = inspection.flow_method === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={selected}
                        disabled={visitLocked}
                        onClick={() =>
                          onInspectionChange({ flow_method: opt.value as FlowEstimationMethod })
                        }
                        className={`min-h-10 rounded-full border px-3 py-2 text-left text-sm font-medium transition-colors ${
                          selected
                            ? 'border-cyan-400/35 bg-cyan-500/15 text-cyan-100'
                            : 'border-white/[0.08] bg-white/[0.03] text-text-secondary hover:bg-white/[0.06]'
                        } disabled:opacity-60`}
                      >
                        <span className="block">{opt.label}</span>
                        <span className="mt-0.5 block text-[11px] font-normal text-text-muted">{opt.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </>
          ) : null}
        </div>
      )}

      {canReachSite && siteCondition === 'flowing_discharge' && streamFlowEstimateDone && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
          <span className="text-sm text-emerald-100">
            {streamFlowEstimationEnabled
              ? 'Stream flow estimate captured — proceed to sample collection'
              : 'Flowing discharge confirmed — proceed to sample collection'}
          </span>
        </div>
      )}

      {sameAsLastHelpers}

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
