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
      title: 'Erosion follow-up suggested',
      body: 'Erosion was observed during inspection. Capture deficiency photos and leave a follow-up note before closing the visit.',
      suggestedNote: 'Deficiency follow-up: erosion observed at or near the outlet. Review whether maintenance or site follow-up is required.',
      needsPhotoBucket: true,
    });
  }

  if (input.inspection.obstruction_observed || input.inspection.flow_status === 'obstructed') {
    prompts.push({
      id: 'obstruction',
      title: 'Obstruction follow-up suggested',
      body: obstruction.type
        ? `Outlet obstruction is part of this record. Route ${obstruction.type.toLowerCase()} evidence into the obstruction / deficiency bucket and leave a specific follow-up note.`
        : 'Outlet obstruction is part of this record. Add evidence in the obstruction / deficiency bucket and leave a specific follow-up note.',
      suggestedNote: obstructionNarrative
        ? `Deficiency follow-up: ${obstruction.type ? `${obstruction.type.toLowerCase()} obstruction` : 'obstruction'} observed at the outlet. Detail: ${obstructionNarrative}`
        : 'Deficiency follow-up: obstruction observed at the outlet. Photos and inspection detail captured for review.',
      needsPhotoBucket: true,
    });
  }

  if (signageConditionNeedsFollowUp(input.inspection.signage_condition)) {
    prompts.push({
      id: 'signage',
      title: 'Signage deficiency suggested',
      body: 'The signage status needs downstream correction. Capture the affected signage, then hand off a deficiency or governance follow-up to the correct owner.',
      suggestedNote: `Deficiency follow-up: signage status recorded as "${input.inspection.signage_condition?.trim()}". Capture corrective owner and target repair action.`,
      needsPhotoBucket: true,
    });
  }

  if (pipeConditionNeedsFollowUp(input.inspection.pipe_condition)) {
    prompts.push({
      id: 'pipe',
      title: 'Pipe condition follow-up suggested',
      body: 'The pipe status needs follow-up. Capture the affected area and note whether maintenance, repair, or route escalation is required.',
      suggestedNote: `Deficiency follow-up: pipe status recorded as "${input.inspection.pipe_condition?.trim()}". Capture the corrective action owner and urgency.`,
      needsPhotoBucket: true,
    });
  }

  if (input.outcome === 'access_issue' && input.existingGovernanceIssueCount === 0) {
    prompts.push({
      id: 'access_escalation',
      title: 'Access issue escalation check',
      body: 'This stop closed as an access issue. Confirm that the narrative and evidence are strong enough for immediate follow-up.',
      suggestedNote: 'Deficiency follow-up: access issue blocked sampling and should be reviewed for route or site action.',
      needsPhotoBucket: true,
    });
  }

  return prompts;
}
