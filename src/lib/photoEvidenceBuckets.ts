import type {
  FieldEvidenceAssetRecord,
  FieldVisitOutcome,
  FieldVisitPhotoCategory,
} from '@/types';

export type PhotoBucketDefinition = {
  id: FieldVisitPhotoCategory;
  label: string;
  shortLabel: string;
  description: string;
};

export type CategorizedPhotoLike = Pick<FieldEvidenceAssetRecord, 'evidence_type' | 'notes'>;

const PHOTO_CATEGORY_PREFIX = '[photo-category:';

export const PHOTO_BUCKETS: PhotoBucketDefinition[] = [
  {
    id: 'outlet_signage',
    label: 'Outlet / signage',
    shortLabel: 'Outlet',
    description: 'Show the monitored point, signage, and sampling location context.',
  },
  {
    id: 'flow_no_flow',
    label: 'Flow / no-flow',
    shortLabel: 'Flow',
    description: 'Document flow condition at the actual sample point.',
  },
  {
    id: 'sample_containers',
    label: 'Sample containers',
    shortLabel: 'Containers',
    description: 'Show bottles, labels, or kits tied to the collection event.',
  },
  {
    id: 'obstruction_deficiency',
    label: 'Obstruction / deficiency',
    shortLabel: 'Deficiency',
    description: 'Capture blocked access, damage, erosion, or other deficiencies.',
  },
  {
    id: 'site_weather',
    label: 'Site / weather',
    shortLabel: 'Site',
    description: 'Record site surroundings or weather conditions that matter for the field record.',
  },
];

const REQUIRED_BY_OUTCOME: Record<FieldVisitOutcome, FieldVisitPhotoCategory[]> = {
  sample_collected: ['sample_containers', 'outlet_signage'],
  no_discharge: ['flow_no_flow', 'outlet_signage'],
  access_issue: ['obstruction_deficiency', 'outlet_signage'],
};

export function getRequiredPhotoCategories(outcome: FieldVisitOutcome): FieldVisitPhotoCategory[] {
  return REQUIRED_BY_OUTCOME[outcome];
}

export function getSuggestedPhotoCategory(outcome: FieldVisitOutcome): FieldVisitPhotoCategory {
  return REQUIRED_BY_OUTCOME[outcome][0] ?? 'outlet_signage';
}

export function getPhotoBucketDefinition(category: FieldVisitPhotoCategory): PhotoBucketDefinition {
  return PHOTO_BUCKETS.find((item) => item.id === category) ?? PHOTO_BUCKETS[0]!;
}

export function parsePhotoEvidenceCategory(notes: string | null | undefined): FieldVisitPhotoCategory | null {
  if (!notes) return null;
  const trimmed = notes.trim();
  if (!trimmed.startsWith(PHOTO_CATEGORY_PREFIX)) return null;
  const endIdx = trimmed.indexOf(']');
  if (endIdx === -1) return null;
  const raw = trimmed.slice(PHOTO_CATEGORY_PREFIX.length, endIdx) as FieldVisitPhotoCategory;
  return PHOTO_BUCKETS.some((item) => item.id === raw) ? raw : null;
}

export function stripPhotoEvidenceCategory(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const category = parsePhotoEvidenceCategory(notes);
  if (!category) return notes.trim() || null;
  const endIdx = notes.indexOf(']');
  const rest = notes.slice(endIdx + 1).trim();
  return rest || null;
}

export function serializePhotoEvidenceCategory(
  category: FieldVisitPhotoCategory,
  notes?: string | null,
): string {
  const rest = notes?.trim();
  return rest ? `${PHOTO_CATEGORY_PREFIX}${category}] ${rest}` : `${PHOTO_CATEGORY_PREFIX}${category}]`;
}

export function countPhotosByCategory(
  items: CategorizedPhotoLike[],
): Record<FieldVisitPhotoCategory, number> {
  const counts = Object.fromEntries(
    PHOTO_BUCKETS.map((bucket) => [bucket.id, 0]),
  ) as Record<FieldVisitPhotoCategory, number>;

  for (const item of items) {
    if (item.evidence_type !== 'photo') continue;
    const category = parsePhotoEvidenceCategory(item.notes);
    if (category) counts[category] += 1;
  }

  return counts;
}
