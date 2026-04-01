import type { FieldVisitOutcome, FieldVisitStopRequirement } from '@/types';

export type FieldVisitQaPrompt = {
  id: string;
  title: string;
  body: string;
  tone: 'warning' | 'info';
  noteTemplate: string;
  focusBucket: 'sample_containers' | 'site_weather' | 'outlet_signage';
};

function hasKeyword(lines: string[], patterns: string[]) {
  const lower = lines.join(' ').toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern));
}

export function getFieldVisitQaPrompts(input: {
  outcome: FieldVisitOutcome;
  siblingVisitCount: number;
  stopRequirements: FieldVisitStopRequirement[];
  routePriorityReason: string | null | undefined;
  totalPhotoCount: number;
  potentialForceMajeure: boolean;
}): FieldVisitQaPrompt[] {
  const prompts: FieldVisitQaPrompt[] = [];
  const instructionLines = input.stopRequirements
    .map((requirement) => requirement.schedule_instructions?.trim() ?? '')
    .filter(Boolean);
  const searchLines = [...instructionLines, input.routePriorityReason?.trim() ?? ''].filter(Boolean);

  if (input.siblingVisitCount > 0) {
    prompts.push({
      id: 'duplicate-stop',
      title: 'Possible duplicate stop',
      body: 'Another same-day visit exists for this outfall. Confirm whether this record is the primary field record or a duplicate dispatch before closeout.',
      tone: 'warning',
      noteTemplate: 'QA prompt: same-day duplicate visit exists for this outfall. Record reviewed for authoritative visit status before closeout.',
      focusBucket: 'outlet_signage',
    });
  }

  if (hasKeyword(searchLines, ['duplicate', 'split sample', 'split', 'field blank', 'qa sample', 'quality assurance'])) {
    prompts.push({
      id: 'special-collection',
      title: 'Special collection handling',
      body: 'Schedule context suggests a QA, duplicate, split, or special handling condition. Confirm bottle labels, sample identity, and notes before the stop is closed.',
      tone: 'warning',
      noteTemplate: 'QA prompt: special collection handling reviewed against the schedule instructions and field labels.',
      focusBucket: 'sample_containers',
    });
  }

  if (input.outcome === 'sample_collected' && input.totalPhotoCount === 0) {
    prompts.push({
      id: 'sample-photo-gap',
      title: 'Collection evidence gap',
      body: 'This collection currently has no photo context. Add a bottle or outlet photo if the visit may need QA or supervisor review later.',
      tone: 'info',
      noteTemplate: 'QA prompt: collection evidence package reviewed for bottle labels, sample context, and supporting photos.',
      focusBucket: 'sample_containers',
    });
  }

  if (input.potentialForceMajeure) {
    prompts.push({
      id: 'fm-qa',
      title: 'Force majeure review context',
      body: 'This visit may need legal or governance review. Tighten timing, site-condition, and evidence notes before completion.',
      tone: 'warning',
      noteTemplate: 'QA prompt: force majeure timing, source, and supporting site conditions reviewed before closeout.',
      focusBucket: 'site_weather',
    });
  }

  return prompts;
}
