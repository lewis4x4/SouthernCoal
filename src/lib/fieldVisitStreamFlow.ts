import type { FlowEstimationCategory, FlowEstimationMethod } from '@/types/field';

/** Midpoint cfs used when a category is first selected (user may override). */
export const FLOW_CATEGORY_MIDPOINT_CFS: Record<FlowEstimationCategory, number> = {
  trickle: 0.05,
  low: 0.5,
  moderate: 3,
  high: 12,
  flood: 25,
};

export const VISUAL_FLOW_CATEGORY_OPTIONS: {
  value: FlowEstimationCategory;
  label: string;
  rangeLabel: string;
  description: string;
}[] = [
  {
    value: 'trickle',
    label: 'Trickle',
    rangeLabel: '< 0.1 cfs',
    description: 'Barely moving water, less than a few inches deep across the channel',
  },
  {
    value: 'low',
    label: 'Low Flow',
    rangeLabel: '0.1 – 1 cfs',
    description: 'Shallow steady flow, ankle depth or less, slow visible movement',
  },
  {
    value: 'moderate',
    label: 'Moderate Flow',
    rangeLabel: '1 – 5 cfs',
    description: 'Visible current, roughly knee-deep or wider channel with steady movement',
  },
  {
    value: 'high',
    label: 'High Flow',
    rangeLabel: '5 – 20 cfs',
    description: 'Fast-moving water, above knee depth, difficult or unsafe to wade',
  },
  {
    value: 'flood',
    label: 'Very High / Flood',
    rangeLabel: '> 20 cfs',
    description: 'Bank-to-bank high water, do not enter stream, unsafe conditions',
  },
];

export const FLOW_ESTIMATION_METHOD_OPTIONS: { value: FlowEstimationMethod; label: string; hint: string }[] = [
  { value: 'visual', label: 'Visual only', hint: 'Estimated by looking at the stream' },
  { value: 'float', label: 'Float method', hint: 'Timed a floating object across a known distance' },
  { value: 'instrument', label: 'Instrument', hint: 'Measured with a portable flow meter' },
];

/**
 * True when this stop should collect visual stream flow (receiving stream / GW-SW / stream stations).
 * Outfall-type discharge points use other methods — skip this UI.
 */
export function isStreamFlowEstimationPointType(outfallType: string | null | undefined): boolean {
  if (!outfallType?.trim()) return false;
  const n = outfallType.trim().toLowerCase();
  if (n === 'outfall' || n === 'outlet') return false;
  if (n.includes('discharge') && !n.includes('stream') && !n.includes('gw')) return false;
  if (n.includes('pipe') && !n.includes('stream')) return false;
  if (n.includes('gw/sw') || n.includes('gw-sw') || n === 'gws') return true;
  if (n.includes('receiving stream')) return true;
  if (n.includes('stream monitoring') || n.includes('stream station')) return true;
  if (n === 'stream' || n.startsWith('stream ')) return true;
  if (n.includes(' stream') || n.endsWith(' stream')) return true;
  if (n.includes('surface water') && (n.includes('monitoring') || n.includes('station'))) return true;
  return false;
}

export function parseFlowEstimateCfsInput(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function clampFlowEstimateCfs(value: number): number {
  return Math.min(999, Math.max(0, Math.round(value * 10) / 10));
}
