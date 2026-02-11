import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { SearchMode } from '@/types/search';

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
  recentQueries: string[];
  inputRef?: React.RefObject<HTMLInputElement | null>;
  searchMode?: SearchMode;
}

export function SearchBar({ onSearch, isLoading, recentQueries, inputRef, searchMode = 'data' }: SearchBarProps) {
  const [value, setValue] = useState('');
  const [showRecent, setShowRecent] = useState(false);
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef || localRef;
  const dropdownRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim() && !isLoading) {
      onSearch(value.trim());
      setShowRecent(false);
    }
  }

  function handleSelectRecent(query: string) {
    setValue(query);
    setShowRecent(false);
    onSearch(query);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowRecent(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <form onSubmit={handleSubmit} className="relative" ref={dropdownRef}>
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border px-4 py-3 transition-all',
          'bg-white/[0.03] backdrop-blur-sm',
          isLoading
            ? 'animate-pulse border-blue-400/40'
            : 'border-white/[0.08] focus-within:border-blue-400/40',
        )}
      >
        <Search className="h-5 w-5 shrink-0 text-white/40" />

        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => recentQueries.length > 0 && setShowRecent(true)}
          placeholder={
            searchMode === 'document'
              ? 'Search within uploaded documents...'
              : 'Ask anything about your compliance data...'
          }
          disabled={isLoading}
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-white/30 focus:outline-none disabled:opacity-50"
        />

        {value && !isLoading && (
          <button
            type="button"
            onClick={() => setValue('')}
            className="rounded p-0.5 text-text-muted transition-colors hover:text-text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {recentQueries.length > 0 && (
          <button
            type="button"
            onClick={() => setShowRecent((v) => !v)}
            className="rounded p-0.5 text-text-muted transition-colors hover:text-text-secondary"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}

        <kbd className="hidden items-center gap-0.5 rounded border border-white/[0.08] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[10px] text-text-muted sm:inline-flex">
          <span className="text-[11px]">&#8984;</span>K
        </kbd>
      </div>

      {/* Recent queries dropdown */}
      {showRecent && recentQueries.length > 0 && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 rounded-xl border border-white/[0.08] bg-crystal-surface/95 py-1 shadow-xl backdrop-blur-xl">
          <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
            Recent searches
          </div>
          {recentQueries.map((q) => (
            <button
              key={q}
              onClick={() => handleSelectRecent(q)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary"
            >
              <Search className="h-3 w-3 shrink-0 text-text-muted" />
              <span className="truncate">{q}</span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
