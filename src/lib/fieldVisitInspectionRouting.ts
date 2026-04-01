const SIGNAGE_CONDITION_OPTIONS = [
  'Good',
  'Damaged',
  'Missing',
  'Not Visible',
  'Not Applicable',
] as const;

const PIPE_CONDITION_OPTIONS = [
  'Good',
  'Minor Damage',
  'Major Damage',
  'Missing',
  'Obstructed',
  'Other',
] as const;

const OBSTRUCTION_TYPE_OPTIONS = [
  'Debris / Sediment',
  'Vegetation',
  'Structural blockage',
  'Ice / standing water',
  'Animal activity',
  'Access blocked',
  'Other',
] as const;

export { SIGNAGE_CONDITION_OPTIONS, PIPE_CONDITION_OPTIONS, OBSTRUCTION_TYPE_OPTIONS };

export type FieldVisitSignageCondition = typeof SIGNAGE_CONDITION_OPTIONS[number];
export type FieldVisitPipeCondition = typeof PIPE_CONDITION_OPTIONS[number];
export type FieldVisitObstructionType = typeof OBSTRUCTION_TYPE_OPTIONS[number] | '';

const LEGACY_SIGNAGE_NORMALIZATION: Record<string, FieldVisitSignageCondition> = {
  good: 'Good',
  readable: 'Good',
  intact: 'Good',
  damaged: 'Damaged',
  broken: 'Damaged',
  poor: 'Damaged',
  illegible: 'Damaged',
  faded: 'Damaged',
  missing: 'Missing',
  'not visible': 'Not Visible',
  obscured: 'Not Visible',
  hidden: 'Not Visible',
  'not applicable': 'Not Applicable',
  n_a: 'Not Applicable',
  na: 'Not Applicable',
};

const LEGACY_PIPE_NORMALIZATION: Record<string, FieldVisitPipeCondition> = {
  good: 'Good',
  clear: 'Good',
  intact: 'Good',
  'minor damage': 'Minor Damage',
  minor: 'Minor Damage',
  cracked: 'Minor Damage',
  'major damage': 'Major Damage',
  major: 'Major Damage',
  collapsed: 'Major Damage',
  broken: 'Major Damage',
  missing: 'Missing',
  obstructed: 'Obstructed',
  blocked: 'Obstructed',
  other: 'Other',
};

function normalizeFromMap<T extends string>(
  value: string | null | undefined,
  options: readonly T[],
  legacyMap: Record<string, T>,
): T | '' {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  const direct = options.find((option) => option.toLowerCase() === trimmed.toLowerCase());
  if (direct) return direct;
  return legacyMap[trimmed.toLowerCase()] ?? '';
}

export function normalizeSignageCondition(value: string | null | undefined): FieldVisitSignageCondition | '' {
  return normalizeFromMap(value, SIGNAGE_CONDITION_OPTIONS, LEGACY_SIGNAGE_NORMALIZATION);
}

export function normalizePipeCondition(value: string | null | undefined): FieldVisitPipeCondition | '' {
  return normalizeFromMap(value, PIPE_CONDITION_OPTIONS, LEGACY_PIPE_NORMALIZATION);
}

export function parseInspectionObstructionDetails(value: string | null | undefined): {
  type: FieldVisitObstructionType;
  details: string;
} {
  const raw = value?.trim() ?? '';
  if (!raw) return { type: '', details: '' };

  const matchedType = OBSTRUCTION_TYPE_OPTIONS.find((option) => raw === option || raw.startsWith(`${option}:`));
  if (!matchedType) {
    return { type: '', details: raw };
  }

  const details = raw === matchedType ? '' : raw.slice(matchedType.length + 1).trim();
  return { type: matchedType, details };
}

export function formatInspectionObstructionDetails(
  type: FieldVisitObstructionType,
  details: string | null | undefined,
): string {
  const trimmed = details?.trim() ?? '';
  if (!type) return trimmed;
  return trimmed ? `${type}: ${trimmed}` : type;
}

export function getInspectionObstructionNarrative(value: string | null | undefined): string {
  return parseInspectionObstructionDetails(value).details.trim();
}

export function signageConditionNeedsFollowUp(value: string | null | undefined): boolean {
  const normalized = normalizeSignageCondition(value);
  return normalized === 'Damaged' || normalized === 'Missing';
}

export function pipeConditionNeedsFollowUp(value: string | null | undefined): boolean {
  const normalized = normalizePipeCondition(value);
  return normalized === 'Minor Damage'
    || normalized === 'Major Damage'
    || normalized === 'Missing'
    || normalized === 'Obstructed'
    || normalized === 'Other';
}
