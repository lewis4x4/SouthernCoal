import type { FieldVisitOutcome, OutletInspectionRecord } from '@/types';
import {
  getInspectionObstructionNarrative,
  parseInspectionObstructionDetails,
  pipeConditionNeedsFollowUp,
  signageConditionNeedsFollowUp,
} from '@/lib/fieldVisitInspectionRouting';

export type FieldVisitDeficiencyPrompt = {
  id: string;
  title: string;
  body: string;
  suggestedNote: string;
  needsPhotoBucket: boolean;
};

export function getFieldVisitDeficiencyPrompts(input: {
  inspection: Partial<OutletInspectionRecord>;
  outcome: FieldVisitOutcome;
  existingGovernanceIssueCount: number;
}): FieldVisitDeficiencyPrompt[] {
  const prompts: FieldVisitDeficiencyPrompt[] = [];

  const obstruction = parseInspectionObstructionDetails(input.inspection.obstruction_details);
  const obstructionNarrative = getInspectionObstructionNarrative(input.inspection.obstruction_details);

  if (input.inspection.erosion_observed) {
    prompts.push({
      id: 'erosion',
      title: 'Erosion photo required',
      body: 'Take a photo of the erosion area before you leave the stop.',
      suggestedNote: 'Deficiency follow-up: erosion observed at or near the outlet. Review whether maintenance or site follow-up is required.',
      needsPhotoBucket: true,
    });
  }

  if (input.inspection.obstruction_observed || input.inspection.flow_status === 'obstructed') {
    prompts.push({
      id: 'obstruction',
      title: 'Obstruction photo required',
      body: obstruction.type
        ? `Take a photo of the ${obstruction.type.toLowerCase()} blocking the outlet.`
        : 'Take a photo of what is blocking the outlet.',
      suggestedNote: obstructionNarrative
        ? `Deficiency follow-up: ${obstruction.type ? `${obstruction.type.toLowerCase()} obstruction` : 'obstruction'} observed at the outlet. Detail: ${obstructionNarrative}`
        : 'Deficiency follow-up: obstruction observed at the outlet. Photos and inspection detail captured for review.',
      needsPhotoBucket: true,
    });
  }

  if (signageConditionNeedsFollowUp(input.inspection.signage_condition)) {
    prompts.push({
      id: 'signage',
      title: 'Signage photo required',
      body: 'Take a photo of the signage condition before you continue.',
      suggestedNote: `Deficiency follow-up: signage status recorded as "${input.inspection.signage_condition?.trim()}". Capture corrective owner and target repair action.`,
      needsPhotoBucket: true,
    });
  }

  if (pipeConditionNeedsFollowUp(input.inspection.pipe_condition)) {
    prompts.push({
      id: 'pipe',
      title: 'Pipe condition photo required',
      body: 'Take a photo of the pipe condition before you continue.',
      suggestedNote: `Deficiency follow-up: pipe status recorded as "${input.inspection.pipe_condition?.trim()}". Capture the corrective action owner and urgency.`,
      needsPhotoBucket: true,
    });
  }

  if (input.outcome === 'access_issue' && input.existingGovernanceIssueCount === 0) {
    prompts.push({
      id: 'access_escalation',
      title: 'Access issue photo required',
      body: 'Take a photo that shows why access blocked the stop.',
      suggestedNote: 'Deficiency follow-up: access issue blocked sampling and should be reviewed for route or site action.',
      needsPhotoBucket: true,
    });
  }

  return prompts;
}
