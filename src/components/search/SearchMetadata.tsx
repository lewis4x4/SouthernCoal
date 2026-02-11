import { Clock } from 'lucide-react';

interface SearchMetadataProps {
  tablesQueried: string[];
  filtersApplied: string[];
  resultCount: number;
  dataFreshness: string;
}

export function SearchMetadata({
  tablesQueried,
  filtersApplied,
  resultCount,
  dataFreshness,
}: SearchMetadataProps) {
  const freshnessLabel = dataFreshness
    ? new Date(dataFreshness).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-white/50">
      {/* Sources */}
      <span>
        Sources:{' '}
        {tablesQueried.map((t, i) => (
          <span key={t}>
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-white/60">
              {t}
            </code>
            {i < tablesQueried.length - 1 && ', '}
          </span>
        ))}
      </span>

      {/* Filters */}
      {filtersApplied.length > 0 && (
        <span>Filters: {filtersApplied.join(', ')}</span>
      )}

      {/* Count */}
      <span>
        {resultCount} result{resultCount !== 1 ? 's' : ''}
      </span>

      {/* Freshness */}
      {freshnessLabel && (
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Data as of: {freshnessLabel}
        </span>
      )}
    </div>
  );
}
