import { describe, expect, it } from 'vitest';
import { getFieldVisitDeficiencyPrompts } from '@/lib/fieldVisitDeficiencyPrompts';

describe('getFieldVisitDeficiencyPrompts', () => {
  it('surfaces prompts for erosion, obstruction, and structured deficiency statuses', () => {
    const prompts = getFieldVisitDeficiencyPrompts({
      inspection: {
        flow_status: 'obstructed',
        erosion_observed: true,
        obstruction_observed: true,
        signage_condition: 'Damaged',
        pipe_condition: 'Major Damage',
        obstruction_details: 'Vegetation: brush packed against the opening',
      },
      outcome: 'sample_collected',
      existingGovernanceIssueCount: 0,
    });

    expect(prompts.map((prompt) => prompt.id)).toEqual(
      expect.arrayContaining(['erosion', 'obstruction', 'signage', 'pipe']),
    );
    expect(prompts.find((prompt) => prompt.id === 'obstruction')?.suggestedNote).toContain(
      'vegetation obstruction observed at the outlet',
    );
  });
});
