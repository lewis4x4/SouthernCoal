import { describe, expect, it } from 'vitest';
import { getFieldVisitDeficiencyPrompts } from '@/lib/fieldVisitDeficiencyPrompts';

describe('getFieldVisitDeficiencyPrompts', () => {
  it('surfaces prompts for erosion, obstruction, and damaged conditions', () => {
    const prompts = getFieldVisitDeficiencyPrompts({
      inspection: {
        flow_status: 'obstructed',
        erosion_observed: true,
        obstruction_observed: true,
        signage_condition: 'Damaged sign',
        pipe_condition: 'Pipe broken near lip',
      },
      outcome: 'sample_collected',
      existingGovernanceIssueCount: 0,
    });

    expect(prompts.map((prompt) => prompt.id)).toEqual(
      expect.arrayContaining(['erosion', 'obstruction', 'signage', 'pipe']),
    );
  });
});
