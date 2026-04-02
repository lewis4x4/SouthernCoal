import { useCallback } from 'react';
import { edgeFunctionFetchHeaders, getFreshToken } from '@/lib/supabase';
import { useSearchStore } from '@/stores/search';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { ComplianceSearchResponse, SearchContext } from '@/types/search';

/**
 * Compliance search hook — calls the compliance-search Edge Function.
 * Uses getFreshToken() from @/lib/supabase for JWT refresh.
 */
export function useComplianceSearch() {
  const { isLoading, results, error, suggestion, reviewMode } = useSearchStore();
  const setLoading = useSearchStore((s) => s.setLoading);
  const setResults = useSearchStore((s) => s.setResults);
  const setError = useSearchStore((s) => s.setError);
  const clearResults = useSearchStore((s) => s.clearResults);
  const addRecentQuery = useSearchStore((s) => s.addRecentQuery);
  const { log } = useAuditLog();

  const search = useCallback(
    async (
      query: string,
      context?: SearchContext,
      overrideReviewMode?: boolean,
    ): Promise<ComplianceSearchResponse | null> => {
      if (!query.trim()) return null;

      setLoading(true);
      clearResults();

      try {
        const token = await getFreshToken();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compliance-search`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...edgeFunctionFetchHeaders(token),
            },
            body: JSON.stringify({
              query,
              context,
              maxResults: 50,
              reviewMode: overrideReviewMode ?? reviewMode,
            }),
            signal: controller.signal,
          },
        );

        clearTimeout(timeoutId);

        if (response.status === 429) {
          setError('Please wait a moment before searching again.');
          return null;
        }

        if (!response.ok) {
          setError(`Search failed (${response.status})`);
          return null;
        }

        const data: ComplianceSearchResponse = await response.json();

        if (!data.success) {
          setError(data.error || 'Search failed', data.suggestion);
          return null;
        }

        setResults(data);
        addRecentQuery(query);

        // Audit log the frontend search action
        log('compliance_search', {
          query,
          queryId: data.metadata?.queryId,
          resultCount: data.results?.count,
          executionTimeMs: data.metadata?.executionTimeMs,
        });

        return data;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setError('Search timed out. Please try a shorter query.');
          return null;
        }
        const message = err instanceof Error ? err.message : 'Search failed';
        setError(message);
        return null;
      }
    },
    [reviewMode, setLoading, clearResults, setResults, setError, addRecentQuery, log],
  );

  return { isLoading, results, error, suggestion, search, clearResults };
}
