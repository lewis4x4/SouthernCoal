import type { FieldVisitOutcome, OutletInspectionRecord } from '@/types';

export type FieldVisitDeficiencyPrompt = {
  id: string;
  title: string;
  body: string;
  suggestedNote: string;
  needsPhotoBucket: boolean;
};

function looksDamaged(value: string | null | undefined): boolean {
  const text = value?.trim().toLowerCase() ?? '';
  if (!text) return false;
  return ['damage', 'damaged', 'missing', 'broken', 'poor', 'illegible', 'leaning', 'corroded'].some((word) =>
    text.includes(word),
  );
}

export function getFieldVisitDeficiencyPrompts(input: {
  inspection: Partial<OutletInspectionRecord>;
  outcome: FieldVisitOutcome;
  existingGovernanceIssueCount: number;
}): FieldVisitDeficiencyPrompt[] {
  const prompts: FieldVisitDeficiencyPrompt[] = [];

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
      body: 'Outlet obstruction is part of this record. Add evidence in the obstruction / deficiency bucket and leave a specific follow-up note.',
      suggestedNote: 'Deficiency follow-up: obstruction observed at the outlet. Photos and inspection detail captured for review.',
      needsPhotoBucket: true,
    });
  }

  if (looksDamaged(input.inspection.signage_condition)) {
    prompts.push({
      id: 'signage',
      title: 'Signage deficiency suggested',
      body: 'The signage condition reads like a deficiency. Capture the affected signage and note what needs correction.',
      suggestedNote: `Deficiency follow-up: signage condition noted as "${input.inspection.signage_condition?.trim()}".`,
      needsPhotoBucket: true,
    });
  }

  if (looksDamaged(input.inspection.pipe_condition)) {
    prompts.push({
      id: 'pipe',
      title: 'Pipe condition follow-up suggested',
      body: 'The pipe condition reads like a deficiency. Capture the affected area and note the corrective follow-up needed.',
      suggestedNote: `Deficiency follow-up: pipe condition noted as "${input.inspection.pipe_condition?.trim()}".`,
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
