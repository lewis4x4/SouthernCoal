import { describe, expect, it } from 'vitest';
import { formatDiscrepancyReviewerLabel, selfReviewDisplayNameFromProfile } from '@/lib/reviewQueueDisplay';

describe('reviewQueueDisplay', () => {
  it('formatDiscrepancyReviewerLabel shows em dash when no reviewer', () => {
    expect(formatDiscrepancyReviewerLabel(null, 'u1', 'Self')).toBe('—');
  });

  it('formatDiscrepancyReviewerLabel shows self name when ids match', () => {
    expect(formatDiscrepancyReviewerLabel('u1', 'u1', 'Jane Doe')).toBe('Jane Doe');
  });

  it('formatDiscrepancyReviewerLabel falls back to You when self name empty', () => {
    expect(formatDiscrepancyReviewerLabel('u1', 'u1', '')).toBe('You');
  });

  it('formatDiscrepancyReviewerLabel truncates other users', () => {
    expect(formatDiscrepancyReviewerLabel('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'u1', 'Self')).toBe(
      'User aaaaaaaa…',
    );
  });

  it('selfReviewDisplayNameFromProfile prefers full name', () => {
    expect(
      selfReviewDisplayNameFromProfile({
        id: 'x',
        email: 'a@b.co',
        first_name: 'A',
        last_name: 'B',
        organization_id: '00000000-0000-4000-8000-000000000001',
        created_at: '',
      }),
    ).toBe('A B');
  });
});
