import { Database, FileText } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSearchStore } from '@/stores/search';
import type { SearchMode } from '@/types/search';

const MODES: Array<{ key: SearchMode; label: string; icon: typeof Database }> = [
  { key: 'data', label: 'Data Search', icon: Database },
  { key: 'document', label: 'Document Search', icon: FileText },
];

export function SearchModeToggle() {
  const searchMode = useSearchStore((s) => s.searchMode);
  const setSearchMode = useSearchStore((s) => s.setSearchMode);

  return (
    <div className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] p-0.5 backdrop-blur-sm">
      {MODES.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => setSearchMode(key)}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all',
            searchMode === key
              ? 'bg-white/[0.1] text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
