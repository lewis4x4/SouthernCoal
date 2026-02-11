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
