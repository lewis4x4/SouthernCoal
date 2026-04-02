import { useCallback } from 'react';
import { edgeFunctionFetchHeaders, getFreshToken } from '@/lib/supabase';
import { useSearchStore } from '@/stores/search';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { DocumentSearchResponse, DocumentSearchFilters } from '@/types/search';

/**
 * Document search hook — calls the document-search Edge Function.
 * Uses same JWT refresh pattern as useComplianceSearch.
 */
export function useDocumentSearch() {
  const { documentLoading, documentResults, documentError } = useSearchStore();
  const setDocumentLoading = useSearchStore((s) => s.setDocumentLoading);
  const setDocumentResults = useSearchStore((s) => s.setDocumentResults);
  const setDocumentError = useSearchStore((s) => s.setDocumentError);
  const clearDocumentResults = useSearchStore((s) => s.clearDocumentResults);
  const addRecentQuery = useSearchStore((s) => s.addRecentQuery);
  const { log } = useAuditLog();

  const search = useCallback(
    async (
      query: string,
      mode: 'chunks' | 'answer' = 'answer',
      filters?: DocumentSearchFilters,
    ): Promise<DocumentSearchResponse | null> => {
      if (!query.trim()) return null;

      setDocumentLoading(true);
      clearDocumentResults();

      try {
        const token = await getFreshToken();

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-search`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...edgeFunctionFetchHeaders(token),
            },
            body: JSON.stringify({
              query,
              mode,
              filters,
              match_threshold: 0.7,
              match_count: 10,
            }),
          },
        );

        if (response.status === 429) {
          setDocumentError('Please wait a moment before searching again.');
          return null;
        }

        const data: DocumentSearchResponse = await response.json();

        if (!data.success) {
          setDocumentError(data.error || 'Document search failed');
          return null;
        }

        setDocumentResults(data);
        addRecentQuery(query);

        // Audit log
        log('document_search', {
          query,
          queryId: data.metadata?.queryId,
          chunkCount: data.metadata?.chunkCount,
          executionTimeMs: data.metadata?.executionTimeMs,
          mode,
        });

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Document search failed';
        setDocumentError(message);
        return null;
      }
    },
    [setDocumentLoading, clearDocumentResults, setDocumentResults, setDocumentError, addRecentQuery, log],
  );

  return {
    isLoading: documentLoading,
    results: documentResults,
    error: documentError,
    search,
    clearResults: clearDocumentResults,
  };
}
