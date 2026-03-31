import { describe, it, expect } from 'vitest';
import { visitIsOpen, visitIsOpenOverdue } from '../fieldVisitStatus';

describe('fieldVisitStatus', () => {
  it('visitIsOpen excludes completed and cancelled', () => {
    expect(visitIsOpen({ visit_status: 'assigned' })).toBe(true);
    expect(visitIsOpen({ visit_status: 'in_progress' })).toBe(true);
    expect(visitIsOpen({ visit_status: 'completed' })).toBe(false);
    expect(visitIsOpen({ visit_status: 'cancelled' })).toBe(false);
  });

  it('visitIsOpenOverdue when scheduled before today and open', () => {
    expect(
      visitIsOpenOverdue(
        { visit_status: 'assigned', scheduled_date: '2026-03-01' },
        '2026-03-31',
      ),
    ).toBe(true);
  });

  it('visitIsOpenOverdue false when same day', () => {
    expect(
      visitIsOpenOverdue(
        { visit_status: 'assigned', scheduled_date: '2026-03-31' },
        '2026-03-31',
      ),
    ).toBe(false);
  });

  it('visitIsOpenOverdue false when completed', () => {
    expect(
      visitIsOpenOverdue(
        { visit_status: 'completed', scheduled_date: '2026-01-01' },
        '2026-03-31',
      ),
    ).toBe(false);
  });
});
