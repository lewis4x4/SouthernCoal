import { create } from 'zustand';
import type { ComplianceSearchResponse } from '@/types/search';

const RECENT_KEY = 'scc_recent_searches';
const REVIEW_KEY = 'scc_search_review_mode';
const MAX_RECENT = 10;

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

interface SearchStore {
  query: string;
  isLoading: boolean;
  results: ComplianceSearchResponse | null;
  error: string | null;
  suggestion: string | null;
  recentQueries: string[];
  reviewMode: boolean;

  setQuery: (query: string) => void;
  setLoading: (loading: boolean) => void;
  setResults: (results: ComplianceSearchResponse) => void;
  setError: (error: string, suggestion?: string | null) => void;
  clearResults: () => void;
  addRecentQuery: (query: string) => void;
  toggleReviewMode: () => void;
}

export const useSearchStore = create<SearchStore>((set) => ({
  query: '',
  isLoading: false,
  results: null,
  error: null,
  suggestion: null,
  recentQueries: loadRecent(),
  reviewMode: localStorage.getItem(REVIEW_KEY) === 'true',

  setQuery: (query) => set({ query }),
  setLoading: (isLoading) => set({ isLoading }),

  setResults: (results) =>
    set({ results, error: null, suggestion: null, isLoading: false }),

  setError: (error, suggestion = null) =>
    set({ error, suggestion, results: null, isLoading: false }),

  clearResults: () =>
    set({ results: null, error: null, suggestion: null }),

  addRecentQuery: (query) =>
    set((state) => {
      const updated = [query, ...state.recentQueries.filter((q) => q !== query)].slice(0, MAX_RECENT);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(updated)); } catch { /* quota */ }
      return { recentQueries: updated };
    }),

  toggleReviewMode: () =>
    set((state) => {
      const next = !state.reviewMode;
      try { localStorage.setItem(REVIEW_KEY, String(next)); } catch { /* quota */ }
      return { reviewMode: next };
    }),
}));
