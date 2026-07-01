import { cn } from '@/lib/cn';
import {
  PHOTO_BUCKETS,
  getRequiredPhotoCategories,
  type PhotoBucketDefinition,
} from '@/lib/photoEvidenceBuckets';
import type { FieldVisitOutcome, FieldVisitPhotoCategory } from '@/types';

interface FieldVisitPhotoBucketsProps {
  outcome: FieldVisitOutcome;
  selectedCategory: FieldVisitPhotoCategory;
  uploadedCounts: Record<FieldVisitPhotoCategory, number>;
  pendingCounts: Record<FieldVisitPhotoCategory, number>;
  allowedCategories?: FieldVisitPhotoCategory[];
  onSelectCategory: (category: FieldVisitPhotoCategory) => void;
}

function isRequired(definition: PhotoBucketDefinition, outcome: FieldVisitOutcome) {
  return getRequiredPhotoCategories(outcome).includes(definition.id);
}

export function FieldVisitPhotoBuckets({
  outcome,
  selectedCategory,
  uploadedCounts,
  pendingCounts,
  allowedCategories,
  onSelectCategory,
}: FieldVisitPhotoBucketsProps) {
  const visibleBuckets = allowedCategories?.length
    ? PHOTO_BUCKETS.filter((bucket) => allowedCategories.includes(bucket.id))
    : PHOTO_BUCKETS;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-text-muted">Category</div>
      <div className="flex flex-wrap gap-2">
        {visibleBuckets.map((bucket) => {
          const required = isRequired(bucket, outcome);
          const selected = selectedCategory === bucket.id;
          const count = (uploadedCounts[bucket.id] ?? 0) + (pendingCounts[bucket.id] ?? 0);
          return (
            <button
              key={bucket.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelectCategory(bucket.id)}
              className={cn(
                'min-h-12 rounded-2xl border px-4 text-sm font-medium transition-colors',
                selected
                  ? 'border-qo-accent/35 bg-qo-accent/15 text-qo-accent'
                  : 'border-black/[0.06] bg-qo-nested text-text-secondary hover:bg-black/[0.04] active:bg-black/[0.06]',
              )}
            >
              {bucket.label}
              {count > 0 ? <span className="ml-1.5 text-text-muted">({count})</span> : null}
              {required ? <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-qo-ochre" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
