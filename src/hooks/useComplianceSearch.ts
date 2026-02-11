import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchStore } from '@/stores/search';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { ComplianceSearchResponse, SearchContext } from '@/types/search';

/**
 * Compliance search hook — calls the compliance-search Edge Function.
 * Uses getFreshToken() pattern from useFileUpload.ts for JWT refresh.
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
        // Get fresh token (refresh if expiring within 60s)
        let token: string;
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError || !refreshed.session) {
            window.location.href = '/login?reason=session_expired';
            throw new Error('Session expired');
          }
          token = refreshed.session.access_token;
        } else {
          // Check if token expires within 60 seconds
          const expiresAt = session.expires_at || 0;
          const expiresInMs = expiresAt * 1000 - Date.now();
          if (expiresInMs < 60_000) {
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError || !refreshed.session) {
              window.location.href = '/login?reason=session_expired';
              throw new Error('Session expired');
            }
            token = refreshed.session.access_token;
          } else {
            token = session.access_token;
          }
        }

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compliance-search`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query,
              context,
              maxResults: 50,
              reviewMode: overrideReviewMode ?? reviewMode,
            }),
          },
        );

        if (response.status === 429) {
          setError('Please wait a moment before searching again.');
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
        const message = err instanceof Error ? err.message : 'Search failed';
        setError(message);
        return null;
      }
    },
    [reviewMode, setLoading, clearResults, setResults, setError, addRecentQuery, log],
  );

  return { isLoading, results, error, suggestion, search, clearResults };
}
