import { useRef, useEffect, useState, useCallback } from 'react';
import { SearchBar } from './SearchBar';
import { SearchResults } from './SearchResults';
import { SearchSuggestions } from './SearchSuggestions';
import { SQLReviewModal } from './SQLReviewModal';
import { SearchModeToggle } from './SearchModeToggle';
import { DocumentSearchResults } from './DocumentSearchResults';
import { DocumentSearchFilters } from './DocumentSearchFilters';
import { RawChunksDebug } from './RawChunksDebug';
import { useComplianceSearch } from '@/hooks/useComplianceSearch';
import { useDocumentSearch } from '@/hooks/useDocumentSearch';
import { useSearchStore } from '@/stores/search';
import { usePermissions } from '@/hooks/usePermissions';
import type { ComplianceSearchResponse } from '@/types/search';

export function ComplianceSearch() {
  const { isLoading, results, error, suggestion, search, clearResults } = useComplianceSearch();
  const {
    isLoading: docLoading,
    results: docResults,
    error: docError,
    search: docSearch,
  } = useDocumentSearch();

  const recentQueries = useSearchStore((s) => s.recentQueries);
  const reviewMode = useSearchStore((s) => s.reviewMode);
  const toggleReviewMode = useSearchStore((s) => s.toggleReviewMode);
  const searchMode = useSearchStore((s) => s.searchMode);
  const documentFilters = useSearchStore((s) => s.documentFilters);
  const { getEffectiveRole } = usePermissions();

  const role = getEffectiveRole();
  const canReview = role === 'executive' || role === 'admin';
  const isAdmin = role === 'admin';
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingReview, setPendingReview] = useState<ComplianceSearchResponse | null>(null);
  const [lastQuery, setLastQuery] = useState('');
  const [chunksMode, setChunksMode] = useState(false);

  const isDocMode = searchMode === 'document';
  const activeLoading = isDocMode ? docLoading : isLoading;
  const activeError = isDocMode ? docError : error;
  const hasResults = isDocMode ? !!docResults : !!results;

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

      if (isDocMode) {
        const activeFilters = (documentFilters.state || documentFilters.document_type || documentFilters.permit_number)
          ? documentFilters
          : undefined;
        await docSearch(query, chunksMode ? 'chunks' : 'answer', activeFilters);
      } else {
        const result = await search(query);
        // If review mode returned SQL without executing, show review modal
        if (result?.metadata?.reviewMode && result.success) {
          setPendingReview(result);
        }
      }
    },
    [isDocMode, search, docSearch, documentFilters, chunksMode],
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

  const showSuggestions = !activeLoading && !hasResults && !activeError;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <SearchModeToggle />
      </div>

      {/* Search bar */}
      <SearchBar
        onSearch={handleSearch}
        isLoading={activeLoading}
        recentQueries={recentQueries}
        inputRef={inputRef}
        searchMode={searchMode}
      />

      {/* Document search filters (document mode only) */}
      {isDocMode && <DocumentSearchFilters />}

      {/* Admin chunks debug toggle (document mode only) */}
      {isAdmin && isDocMode && (
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={chunksMode}
            onChange={() => setChunksMode((v) => !v)}
            className="h-3.5 w-3.5 rounded border-white/20 bg-white/[0.05] text-purple-500 focus:ring-0 focus:ring-offset-0"
          />
          Raw chunks debug mode
        </label>
      )}

      {/* Review mode toggle (Executive/Admin only, data mode only) */}
      {canReview && !isDocMode && (
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
        <SearchSuggestions userRole={role} onSelect={handleSearch} searchMode={searchMode} />
      )}

      {/* Loading state */}
      {activeLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
          <span className="ml-3 text-sm text-text-secondary">
            {isDocMode ? 'Searching documents...' : 'Searching compliance data...'}
          </span>
        </div>
      )}

      {/* Error state */}
      {activeError && !hasResults && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-6">
          <p className="text-sm text-text-primary">{activeError}</p>
          {!isDocMode && suggestion && <p className="mt-1 text-xs text-text-secondary">{suggestion}</p>}
        </div>
      )}

      {/* Results — mode-specific */}
      {isDocMode && docResults && chunksMode && docResults.chunks.length > 0 && (
        <RawChunksDebug chunks={docResults.chunks} />
      )}
      {isDocMode && docResults && !chunksMode && (
        <DocumentSearchResults response={docResults} onRetry={handleRetry} />
      )}
      {!isDocMode && results && (
        <SearchResults response={results} onRetry={handleRetry} />
      )}

      {/* SQL Review Modal (data mode only) */}
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
