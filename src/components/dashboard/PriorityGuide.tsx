import { useState } from 'react';
import { useComplianceMatrix } from '@/hooks/useComplianceMatrix';
import { CATEGORIES } from '@/lib/constants';
import { cn } from '@/lib/cn';
import { ChevronDown, ChevronRight, CheckCircle2, Circle } from 'lucide-react';

/**
 * Collapsible priority guide sidebar.
 * Shows categories sorted by priority with upload status indicators.
 */
export function PriorityGuide() {
  const [isOpen, setIsOpen] = useState(true);
  const { categoryCounts } = useComplianceMatrix();

  const sorted = [...CATEGORIES].sort((a, b) => a.priority - b.priority);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-3 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors"
      >
        <h3 className="text-sm font-semibold text-text-primary">Priority Guide</h3>
        <span className="text-text-muted">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {isOpen && (
        <div className="p-3 space-y-1">
          {sorted.map((cat) => {
            const count = categoryCounts[cat.dbKey] ?? 0;
            const hasFiles = count > 0;

            return (
              <div
                key={cat.dbKey}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors',
                  'hover:bg-white/[0.03]',
                )}
              >
                {hasFiles ? (
                  <CheckCircle2 size={14} className="text-status-imported flex-shrink-0" />
                ) : (
                  <Circle size={14} className="text-status-failed flex-shrink-0" />
                )}
                <span
                  className={cn(
                    'text-xs flex-1',
                    hasFiles ? 'text-text-primary' : 'text-text-secondary',
                  )}
                >
                  {cat.label}
                </span>
                <span className="text-[10px] font-mono text-text-muted">
                  {count}
                </span>
                <span className="text-[10px] text-text-muted">
                  P{cat.priority}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
