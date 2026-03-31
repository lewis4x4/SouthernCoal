import { describe, it, expect } from 'vitest';
import { describeGovernanceDeadline } from '../governanceDeadlines';

describe('describeGovernanceDeadline', () => {
  const fixed = Date.UTC(2026, 2, 15, 12, 0, 0); // Mar 15 2026 noon UTC

  it('returns empty for nullish', () => {
    expect(describeGovernanceDeadline(null, fixed).tone).toBe('empty');
    expect(describeGovernanceDeadline(undefined, fixed).tone).toBe('empty');
    expect(describeGovernanceDeadline('', fixed).tone).toBe('empty');
  });

  it('marks past deadlines overdue', () => {
    const past = new Date(fixed - 3600 * 1000).toISOString();
    const r = describeGovernanceDeadline(past, fixed);
    expect(r.tone).toBe('overdue');
    expect(r.text).toContain('overdue');
  });

  it('uses soon tone within 48h', () => {
    const soon = new Date(fixed + 36 * 3600 * 1000).toISOString();
    const r = describeGovernanceDeadline(soon, fixed);
    expect(r.tone).toBe('soon');
    expect(r.text).toMatch(/left\)/);
  });

  it('uses ok tone beyond 48h', () => {
    const later = new Date(fixed + 5 * 24 * 3600 * 1000).toISOString();
    const r = describeGovernanceDeadline(later, fixed);
    expect(r.tone).toBe('ok');
    expect(r.text).toMatch(/\d+d left/);
  });
});
