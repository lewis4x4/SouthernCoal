import { describe, expect, it } from 'vitest';
import { getPenaltySourceLink, PENALTY_SOURCE_LINKS, parsePenaltyLedgerSummary } from '@/lib/penaltyLedger';

describe('penaltyLedger', () => {
  it('maps exposure source keys to drill-down routes', () => {
    expect(getPenaltySourceLink('fts_uploaded')).toBe(PENALTY_SOURCE_LINKS.fts_uploaded);
    expect(getPenaltySourceLink('sampling_gap_draft')).toBe('/compliance/missed-at-risk');
    expect(getPenaltySourceLink('unknown')).toBeNull();
  });

  it('parses summary with citation-bearing sources', () => {
    const parsed = parsePenaltyLedgerSummary({
      sources: [
        {
          key: 'sampling_gap_draft',
          label: 'Missed Sampling (draft estimate)',
          amount: 1000,
          event_count: 5,
          confidence: 'draft_estimate',
          citation: 'Consent Decree ¶49 — draft miss-sampling estimate',
          verification_status: 'draft',
        },
      ],
      totals: { draft_combined: 1000, uploaded_only: 0, estimated_gaps: 1000 },
      data_coverage: { fts_rows: 0, open_gaps: 5, obligations_with_penalty: 0, open_violations: 0 },
      verification_status: 'draft',
    });

    expect(parsed?.sources[0]?.citation).toContain('¶49');
    expect(parsed?.totals.draft_combined).toBe(1000);
  });
});
