import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { STATES } from '@/lib/constants';
import { CATEGORIES } from '@/lib/constants';
import { useSearchStore } from '@/stores/search';
import { supabase } from '@/lib/supabase';
import type { DocumentSearchFilters as Filters } from '@/types/search';

const DOC_TYPES = CATEGORIES.map((c) => ({ value: c.dbKey, label: c.label }));
const STATE_CODES = STATES.map((s) => s.code);

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors',
        active
          ? 'border-qo-accent/30 bg-cyan-400/10 text-qo-accent'
          : 'border-black/[0.08] bg-qo-nested text-text-muted hover:bg-black/[0.05] hover:text-text-secondary',
      )}
    >
      {label}
    </button>
  );
}

export function DocumentSearchFilters() {
  const filters = useSearchStore((s) => s.documentFilters);
  const setDocumentFilters = useSearchStore((s) => s.setDocumentFilters);

  function toggle(key: keyof Filters, value: string) {
    setDocumentFilters({
      ...filters,
      [key]: filters[key] === value ? undefined : value,
    });
  }

  const [permitInput, setPermitInput] = useState(filters.permit_number || '');
  const [permitSuggestions, setPermitSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const permitRef = useRef<HTMLDivElement>(null);

  // Debounced permit number autocomplete
  useEffect(() => {
    if (permitInput.length < 2) {
      setPermitSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('npdes_permits')
        .select('permit_number')
        .ilike('permit_number', `%${permitInput}%`)
        .limit(10);
      setPermitSuggestions(
        [...new Set((data || []).map((d: { permit_number: string }) => d.permit_number))],
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [permitInput]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (permitRef.current && !permitRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function selectPermit(value: string) {
    setPermitInput(value);
    setShowSuggestions(false);
    setDocumentFilters({ ...filters, permit_number: value });
  }

  function clearPermit() {
    setPermitInput('');
    setDocumentFilters({ ...filters, permit_number: undefined });
  }

  const hasActive = filters.state || filters.document_type || filters.permit_number;

  return (
    <div className="space-y-2">
      {/* State pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
          State
        </span>
        {STATE_CODES.map((code) => (
          <Chip
            key={code}
            label={code}
            active={filters.state === code}
            onClick={() => toggle('state', code)}
          />
        ))}
      </div>

      {/* Document type pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
          Type
        </span>
        {DOC_TYPES.map((dt) => (
          <Chip
            key={dt.value}
            label={dt.label}
            active={filters.document_type === dt.value}
            onClick={() => toggle('document_type', dt.value)}
          />
        ))}
      </div>

      {/* Permit number input */}
      <div className="flex flex-wrap items-center gap-1.5" ref={permitRef}>
        <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
          Permit
        </span>
        <div className="relative">
          <input
            type="text"
            value={permitInput}
            onChange={(e) => {
              setPermitInput(e.target.value);
              setShowSuggestions(true);
              if (!e.target.value) clearPermit();
            }}
            onFocus={() => permitSuggestions.length > 0 && setShowSuggestions(true)}
            placeholder="e.g. KY0012345"
            className="w-36 rounded-lg border border-black/[0.08] bg-qo-nested px-2.5 py-1 text-[11px] text-text-primary placeholder:text-text-muted focus:border-qo-accent/30 focus:outline-none focus:ring-1 focus:ring-cyan-400/20"
          />
          {showSuggestions && permitSuggestions.length > 0 && (
            <div className="absolute top-full left-0 z-50 mt-1 w-48 rounded-lg border border-black/[0.08] bg-white py-1 shadow-xl ">
              {permitSuggestions.map((p) => (
                <button
                  key={p}
                  onClick={() => selectPermit(p)}
                  className="flex w-full px-3 py-1.5 text-left text-[11px] text-text-secondary transition-colors hover:bg-black/[0.05] hover:text-text-primary"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
        {filters.permit_number && (
          <button
            onClick={clearPermit}
            className="text-[10px] text-text-muted hover:text-text-secondary"
          >
            ×
          </button>
        )}
      </div>

      {/* Clear filters */}
      {hasActive && (
        <button
          onClick={() => {
            setDocumentFilters({});
            setPermitInput('');
          }}
          className="text-[11px] text-text-muted transition-colors hover:text-text-secondary"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
