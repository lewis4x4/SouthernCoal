import { useRef, useEffect, useState, useCallback } from 'react';
import { SearchBar } from './SearchBar';
import { SearchResults } from './SearchResults';
import { SearchSuggestions } from './SearchSuggestions';
import { SQLReviewModal } from './SQLReviewModal';
import { useComplianceSearch } from '@/hooks/useComplianceSearch';
import { useSearchStore } from '@/stores/search';
import { usePermissions } from '@/hooks/usePermissions';
import type { ComplianceSearchResponse } from '@/types/search';

export function ComplianceSearch() {
  const { isLoading, results, error, suggestion, search, clearResults } = useComplianceSearch();
  const recentQueries = useSearchStore((s) => s.recentQueries);
  const reviewMode = useSearchStore((s) => s.reviewMode);
  const toggleReviewMode = useSearchStore((s) => s.toggleReviewMode);
  const { getEffectiveRole } = usePermissions();

  const role = getEffectiveRole();
  const canReview = role === 'executive' || role === 'admin';
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingReview, setPendingReview] = useState<ComplianceSearchResponse | null>(null);
  const [lastQuery, setLastQuery] = useState('');

  // Cmd+K focuses search input on this page
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearch = useCallback(
    async (query: string) => {
      setLastQuery(query);
      const result = await search(query);

      // If review mode returned SQL without executing, show review modal
      if (result?.metadata?.reviewMode && result.success) {
        setPendingReview(result);
      }
    },
    [search],
  );

  async function handleConfirmReview() {
    if (!lastQuery) return;
    setPendingReview(null);
    // Re-run without review mode to execute
    await search(lastQuery, undefined, false);
  }

  function handleCancelReview() {
    setPendingReview(null);
    clearResults();
  }

  function handleRetry() {
    if (lastQuery) {
      handleSearch(lastQuery);
    }
  }

  const showSuggestions = !isLoading && !results && !error;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Search bar */}
      <SearchBar
        onSearch={handleSearch}
        isLoading={isLoading}
        recentQueries={recentQueries}
        inputRef={inputRef}
      />

      {/* Review mode toggle (Executive/Admin only) */}
      {canReview && (
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={reviewMode}
            onChange={toggleReviewMode}
            className="h-3.5 w-3.5 rounded border-white/20 bg-white/[0.05] text-blue-500 focus:ring-0 focus:ring-offset-0"
          />
          Review SQL before execution
        </label>
      )}

      {/* Suggestions */}
      {showSuggestions && (
        <SearchSuggestions userRole={role} onSelect={handleSearch} />
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
          <span className="ml-3 text-sm text-text-secondary">Searching compliance data...</span>
        </div>
      )}

      {/* Error state (no results object) */}
      {error && !results && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-6">
          <p className="text-sm text-text-primary">{error}</p>
          {suggestion && <p className="mt-1 text-xs text-text-secondary">{suggestion}</p>}
        </div>
      )}

      {/* Results */}
      {results && <SearchResults response={results} onRetry={handleRetry} />}

      {/* SQL Review Modal */}
      {pendingReview && (
        <SQLReviewModal
          query={pendingReview.query}
          onConfirm={handleConfirmReview}
          onCancel={handleCancelReview}
        />
      )}
    </div>
  );
}
