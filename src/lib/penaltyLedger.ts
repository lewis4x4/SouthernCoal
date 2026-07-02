export type PenaltyLedgerConfidence = 'uploaded' | 'draft_estimate' | 'calculated' | 'mixed';

export interface PenaltyLedgerSource {
  key: string;
  label: string;
  amount: number;
  event_count: number;
  confidence: PenaltyLedgerConfidence;
  citation?: string;
  verification_status?: 'draft' | 'verified' | 'disputed';
}

export interface PenaltyLedgerSummary {
  organization_id?: string;
  computed_at?: string;
  verification_status: 'draft' | 'verified';
  latest_verification?: {
    id?: string;
    verified_at?: string;
    verified_by?: string;
    note?: string | null;
    coverage_summary?: Record<string, unknown>;
  };
  sources: PenaltyLedgerSource[];
  totals: {
    draft_combined: number;
    uploaded_only: number;
    estimated_gaps: number;
  };
  data_coverage: {
    fts_rows: number;
    open_gaps: number;
    obligations_with_penalty: number;
    open_violations: number;
  };
  disclaimer: string;
  error?: string;
}

export const PENALTY_CONFIDENCE_LABELS: Record<PenaltyLedgerConfidence, string> = {
  uploaded: 'Uploaded data',
  draft_estimate: 'Draft estimate',
  calculated: 'Calculated accrual',
  mixed: 'Est./actual mix',
};

export const PENALTY_SOURCE_LINKS: Record<string, string> = {
  fts_uploaded: '/compliance/failure-to-sample',
  sampling_gap_draft: '/compliance/missed-at-risk',
  cd_obligations: '/obligations',
  compliance_violations: '/compliance/violations',
};

export function getPenaltySourceLink(sourceKey: string): string | null {
  return PENALTY_SOURCE_LINKS[sourceKey] ?? null;
}

export function parsePenaltyLedgerSummary(raw: unknown): PenaltyLedgerSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.error) {
    return {
      verification_status: 'draft',
      sources: [],
      totals: { draft_combined: 0, uploaded_only: 0, estimated_gaps: 0 },
      data_coverage: { fts_rows: 0, open_gaps: 0, obligations_with_penalty: 0, open_violations: 0 },
      disclaimer: 'DRAFT — internal estimate, not verified for external or legal use',
      error: String(obj.error),
    };
  }

  const sources = Array.isArray(obj.sources)
    ? (obj.sources as PenaltyLedgerSource[])
    : [];

  const totals = (obj.totals as PenaltyLedgerSummary['totals']) ?? {
    draft_combined: 0,
    uploaded_only: 0,
    estimated_gaps: 0,
  };

  const data_coverage = (obj.data_coverage as PenaltyLedgerSummary['data_coverage']) ?? {
    fts_rows: 0,
    open_gaps: 0,
    obligations_with_penalty: 0,
    open_violations: 0,
  };

  return {
    organization_id: obj.organization_id as string | undefined,
    computed_at: obj.computed_at as string | undefined,
    verification_status: obj.verification_status === 'verified' ? 'verified' : 'draft',
    latest_verification: obj.latest_verification as PenaltyLedgerSummary['latest_verification'],
    sources,
    totals,
    data_coverage,
    disclaimer: String(obj.disclaimer ?? 'DRAFT — internal estimate, not verified for external or legal use'),
  };
}
