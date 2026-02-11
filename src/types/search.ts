// ---------------------------------------------------------------------------
// Document Search (RAG) types
// ---------------------------------------------------------------------------

export type SearchMode = 'data' | 'document';

export interface DocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  chunk_text: string;
  source_page: number;
  source_section: string | null;
  document_type: string;
  state_code: string;
  permit_number: string | null;
  file_name: string;
  similarity: number;
}

export interface DocumentSearchResponse {
  success: boolean;
  mode: 'chunks' | 'answer';
  query: string;
  answer: string | null;
  chunks: DocumentChunk[];
  metadata: {
    queryId: string;
    chunkCount: number;
    executionTimeMs: number;
    matchThreshold: number;
  };
  disclaimer: string;
  error?: string;
}

export interface DocumentSearchFilters {
  state?: string;
  document_type?: string;
  permit_number?: string;
}

// ---------------------------------------------------------------------------
// Compliance Search (SQL) types
// ---------------------------------------------------------------------------

export type QueryDomain =
  | 'permits'
  | 'exceedances'
  | 'penalties'
  | 'sampling'
  | 'organizations'
  | 'lab_results'
  | 'dmr'
  | 'consent_decree'
  | 'enforcement';

export type SearchResultType = 'table' | 'count' | 'single_value' | 'summary';

export interface SearchContext {
  stateFilter?: string;
  siteFilter?: string;
  dateRange?: {
    start: string;
    end: string;
  };
}

export interface ComplianceSearchRequest {
  query: string;
  context?: SearchContext;
  maxResults?: number;
  reviewMode?: boolean;
}

export interface ComplianceSearchResponse {
  success: boolean;
  query: {
    original: string;
    sql: string;
    description: string;
    tablesQueried: string[];
    filtersApplied: string[];
  };
  results: {
    data: Record<string, unknown>[];
    count: number;
    resultType: SearchResultType;
    columns: string[];
  };
  metadata: {
    executionTimeMs: number;
    domainsSearched: QueryDomain[];
    rlsEnforced: true;
    queryId: string;
    dataFreshness: string;
    estimatedTokenCost: number;
    reviewMode: boolean;
  };
  error?: string;
  suggestion?: string;
}
