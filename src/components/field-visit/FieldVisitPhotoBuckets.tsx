import { Camera } from 'lucide-react';
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
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <div className="flex items-center gap-2">
        <Camera className="h-4 w-4 text-cyan-300" aria-hidden />
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
            Photo evidence buckets
          </h3>
          <p className="mt-2 text-sm text-text-secondary">
            Choose the bucket before uploading. Photos stay on the same upload path, but the record now carries typed evidence context.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {visibleBuckets.map((bucket) => {
          const required = isRequired(bucket, outcome);
          const selected = selectedCategory === bucket.id;
          return (
            <button
              key={bucket.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelectCategory(bucket.id)}
              className={cn(
                'rounded-xl border px-4 py-4 text-left transition-colors',
                selected
                  ? 'border-cyan-400/35 bg-cyan-500/12'
                  : 'border-white/[0.06] bg-black/10 hover:bg-white/[0.05]',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-text-primary">{bucket.label}</div>
                {required ? (
                  <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100">
                    Outcome-critical
                  </span>
                ) : null}
              </div>
              <div className="mt-2 text-sm leading-6 text-text-secondary">{bucket.description}</div>
              <div className="mt-3 text-xs text-text-muted">
                {uploadedCounts[bucket.id] ?? 0} uploaded / {pendingCounts[bucket.id] ?? 0} pending
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
