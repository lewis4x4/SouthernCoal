import { describe, expect, it } from 'vitest';
import { formatSlice1ActivationSummary, type Slice1ActivationGapsReport } from '@/lib/slice1ActivationGaps';

const SAMPLE: Slice1ActivationGapsReport = {
  funnel: {
    distinct_violation_keys: 13199,
    has_permit: 8816,
    has_outfall: 4365,
    has_parameter: 3442,
    has_permit_limit: 2140,
  },
  mirror_keys: 13069,
  pending_missing_internal: 148227,
  permits_without_federal_override: 32,
  top_permits_missing_limits: [
    { permit_number: 'KYGE40869', npdes_id: 'KYGE40869', missing_limit_keys: 256 },
  ],
};

describe('slice1ActivationGaps', () => {
  it('formats activation summary with top permit gap', () => {
    const text = formatSlice1ActivationSummary(SAMPLE);
    expect(text).toContain('13,069 mirrored');
    expect(text).toContain('2,140 resolvable');
    expect(text).toContain('148,227 pending');
    expect(text).toContain('KYGE40869 (256 keys)');
  });
});
