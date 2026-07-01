import { describe, expect, it } from 'vitest';
import { formatDefensibleMissMarkdown } from '@/lib/defensibleMiss';

describe('formatDefensibleMissMarkdown', () => {
  it('includes flanking samples and disclaimer', () => {
    const md = formatDefensibleMissMarkdown(
      {
        gap_id: 'g1',
        outfall_id: 'o1',
        parameter_id: 'p1',
        scheduled_date: '2026-01-15',
        days_late: 7,
        before_sample: {
          lab_result_id: 'lr1',
          sample_date: '2026-01-08',
          result_value: 1.2,
          result_text: null,
          unit: 'mg/L',
          is_non_detect: false,
          analyzed_date: '2026-01-10',
        },
        after_sample: null,
        defense_note: 'DRAFT — counsel review only',
      },
      '001',
      'pH',
    );

    expect(md).toContain('2026-01-08');
    expect(md).toContain('No qualifying clean sample');
    expect(md).toContain('SCC Compliance Monitor');
    expect(md).toContain('DRAFT');
  });
});
