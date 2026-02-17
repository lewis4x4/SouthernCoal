import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { useMonitoringStore } from '@/stores/monitoring';
import type { ExceedanceSeverity, ExceedanceStatus } from '@/types';

const SEVERITY_OPTIONS: Array<{ value: ExceedanceSeverity | 'all'; label: string }> = [
  { value: 'all', label: 'All Severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'major', label: 'Major' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'minor', label: 'Minor' },
];

const STATUS_OPTIONS: Array<{ value: ExceedanceStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'under_investigation', label: 'Investigating' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'false_positive', label: 'False Positive' },
];

interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}

function Chip({ label, active, onClick, color }: ChipProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
        active
          ? color || 'bg-primary/20 text-primary border border-primary/30'
          : 'bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10',
      )}
    >
      {label}
    </button>
  );
}

export function FilterChips() {
  const { filters, setFilters, resetFilters } = useMonitoringStore();

  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.severity !== 'all' ||
    filters.outfallId ||
    filters.parameterId ||
    filters.dateFrom ||
    filters.dateTo;

  return (
    <div className="space-y-3">
      {/* Severity filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground w-16">Severity:</span>
        {SEVERITY_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            active={filters.severity === option.value}
            onClick={() => setFilters({ severity: option.value })}
            color={
              option.value === 'critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
              option.value === 'major' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
              option.value === 'moderate' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
              option.value === 'minor' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
              undefined
            }
          />
        ))}
      </div>

      {/* Status filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground w-16">Status:</span>
        {STATUS_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            active={filters.status === option.value}
            onClick={() => setFilters({ status: option.value })}
            color={
              option.value === 'open' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
              option.value === 'acknowledged' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
              option.value === 'resolved' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
              undefined
            }
          />
        ))}
      </div>

      {/* Clear filters */}
      {hasActiveFilters && (
        <button
          onClick={resetFilters}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" />
          Clear filters
        </button>
      )}
    </div>
  );
}
