import { describe, expect, it } from 'vitest';
import { getFieldVisitReviewHooks } from '@/lib/fieldVisitReviewHooks';

describe('getFieldVisitReviewHooks', () => {
  it('surfaces duplicate, thin-evidence, and sync review markers', () => {
    const hooks = getFieldVisitReviewHooks({
      outcome: 'access_issue',
      totalPhotoCount: 1,
      siblingVisitCount: 1,
      governanceIssues: [],
      deficiencyPromptCount: 1,
      contactAttempted: false,
      accessIssueType: 'safety_hazard',
      potentialForceMajeure: true,
      outboundPendingCount: 1,
      evidenceFailureCount: 1,
    });

    expect(hooks.map((hook) => hook.id)).toEqual(
      expect.arrayContaining([
        'duplicate-stop',
        'deficiency-review',
        'contact-missing',
        'outcome-thin-evidence',
        'safety-review',
        'fm-review',
        'sync-review',
      ]),
    );
  });
});
