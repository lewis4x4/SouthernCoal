import { describe, expect, it } from 'vitest';
import { getFieldVisitQaPrompts } from '@/lib/fieldVisitQaPrompts';

describe('getFieldVisitQaPrompts', () => {
  it('surfaces duplicate, special-handling, and force-majeure QA prompts', () => {
    const prompts = getFieldVisitQaPrompts({
      outcome: 'sample_collected',
      siblingVisitCount: 1,
      stopRequirements: [
        {
          calendar_id: 'cal-1',
          schedule_id: 'sched-1',
          parameter_id: 'param-1',
          parameter_name: 'pH',
          parameter_short_name: 'pH',
          parameter_label: 'pH',
          category: 'physical',
          default_unit: 's.u.',
          sample_type: 'grab',
          schedule_instructions: 'Collect duplicate split sample for QA.',
        },
      ],
      routePriorityReason: 'Short hold duplicate route check.',
      totalPhotoCount: 0,
      potentialForceMajeure: true,
    });

    expect(prompts.map((prompt) => prompt.id)).toEqual(
      expect.arrayContaining([
        'duplicate-stop',
        'special-collection',
        'sample-photo-gap',
        'fm-qa',
      ]),
    );
  });
});
