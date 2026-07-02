import { describe, expect, it } from 'vitest';
import {
  WORK_ORDER_SOURCE_LABELS,
  getWorkOrderSourceLink,
} from '@/lib/workOrderSourceLinks';

describe('workOrderSourceLinks', () => {
  it('maps detector source types to review pages', () => {
    expect(getWorkOrderSourceLink('sampling_gap', 'gap-1')).toEqual({
      label: 'View sampling gap',
      href: '/compliance/missed-at-risk?gapId=gap-1',
    });
    expect(getWorkOrderSourceLink('edd_paragraph49', 'eval-1')).toEqual({
      label: 'View EDD evaluation',
      href: '/compliance/late-incomplete-edd?evalId=eval-1',
    });
  });

  it('labels K1 detector source types', () => {
    expect(WORK_ORDER_SOURCE_LABELS.sampling_gap).toBe('Sampling gap detector');
    expect(WORK_ORDER_SOURCE_LABELS.msha_abatement).toBe('MSHA abatement');
  });
});
