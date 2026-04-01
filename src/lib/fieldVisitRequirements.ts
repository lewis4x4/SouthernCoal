import type {
  FieldVisitListItem,
  FieldVisitOutcome,
  FieldVisitRequiredMeasurement,
  FieldVisitStopRequirement,
} from '@/types';
import { inferExpectedBottleTypesForStop, formatBottleTypeLabel } from '@/lib/containerScan';
import { getRequiredPhotoCategories, getPhotoBucketDefinition } from '@/lib/photoEvidenceBuckets';

export type FieldVisitUrgencyFlag = {
  id: string;
  label: string;
  tone: 'critical' | 'warning' | 'info';
  description: string;
};

export type FieldVisitEvidenceExpectation = {
  id: string;
  label: string;
  description: string;
  requiredNow: boolean;
};

export type FieldVisitRequirementsModel = {
  bottleExpectations: string[];
  requiredEvidence: FieldVisitEvidenceExpectation[];
  urgencyFlags: FieldVisitUrgencyFlag[];
  instructionLines: string[];
};

function daysUntil(date: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  return Math.round((target.getTime() - now.getTime()) / 86_400_000);
}

function buildUrgencyFlags(visit: FieldVisitListItem, stopRequirements: FieldVisitStopRequirement[]): FieldVisitUrgencyFlag[] {
  const flags: FieldVisitUrgencyFlag[] = [];
  const diff = daysUntil(visit.scheduled_date);
  const lowerReason = visit.route_priority_reason?.toLowerCase() ?? '';
  const lowerInstructions = stopRequirements
    .map((item) => item.schedule_instructions?.toLowerCase() ?? '')
    .join(' ');

  if (diff < 0) {
    flags.push({
      id: 'overdue',
      label: 'Overdue stop',
      tone: 'critical',
      description: 'This stop is scheduled before today. Close the record carefully and keep supporting evidence tight.',
    });
  } else if (diff === 0) {
    flags.push({
      id: 'due_today',
      label: 'Due today',
      tone: 'warning',
      description: 'This stop is on today’s route. Finish the record while the site context is still current.',
    });
  } else if (diff <= 2) {
    flags.push({
      id: 'due_soon',
      label: 'Due soon',
      tone: 'info',
      description: 'This stop is time-sensitive in the current sampling window.',
    });
  }

  if (lowerReason.includes('short') || lowerReason.includes('hold') || lowerInstructions.includes('short hold')) {
    flags.push({
      id: 'short_hold',
      label: 'Short-hold handling',
      tone: 'critical',
      description: 'Sampling instructions indicate short-hold or time-sensitive handling. Work the stop and evidence without delay.',
    });
  }

  if (visit.route_priority_reason && !flags.some((flag) => flag.description === visit.route_priority_reason)) {
    flags.push({
      id: 'route_priority',
      label: 'Route priority',
      tone: 'info',
      description: visit.route_priority_reason,
    });
  }

  return flags;
}

function buildRequiredEvidence(outcome: FieldVisitOutcome): FieldVisitEvidenceExpectation[] {
  const photoCategories = getRequiredPhotoCategories(outcome).map((category) => ({
    id: category,
    label: getPhotoBucketDefinition(category).label,
    description: getPhotoBucketDefinition(category).description,
    requiredNow: outcome !== 'sample_collected',
  }));

  if (outcome === 'sample_collected') {
    return [
      {
        id: 'coc',
        label: 'Chain of custody',
        description: 'Primary container ID and preservative confirmation are required before completion.',
        requiredNow: true,
      },
      {
        id: 'field_measurements',
        label: 'On-site field measurements',
        description: 'Record only field-known readings required for this stop. Lab analytes arrive later.',
        requiredNow: true,
      },
      ...photoCategories,
    ];
  }

  if (outcome === 'no_discharge') {
    return [
      {
        id: 'narrative',
        label: 'No-discharge narrative',
        description: 'Describe what you observed at the actual sample point and why no sample was taken.',
        requiredNow: true,
      },
      ...photoCategories,
    ];
  }

  return [
    {
      id: 'narrative',
      label: 'Access issue narrative',
      description: 'Document what blocked access, what you attempted, and what reviewers need next.',
      requiredNow: true,
    },
    {
      id: 'contact',
      label: 'Contact attempts',
      description: 'Capture any contact made or attempted so escalation starts with context.',
      requiredNow: false,
    },
    ...photoCategories,
  ];
}

export function buildFieldVisitRequirementsModel(input: {
  visit: FieldVisitListItem;
  outcome: FieldVisitOutcome;
  stopRequirements: FieldVisitStopRequirement[];
  requiredMeasurements: FieldVisitRequiredMeasurement[];
}): FieldVisitRequirementsModel {
  const bottleExpectations = inferExpectedBottleTypesForStop(input.stopRequirements).map(formatBottleTypeLabel);
  const instructionLines = [...new Set(
    input.stopRequirements
      .map((requirement) => requirement.schedule_instructions?.trim())
      .filter((instruction): instruction is string => Boolean(instruction)),
  )];

  if (input.requiredMeasurements.length > 0 && !instructionLines.some((line) => line.toLowerCase().includes('field'))) {
    instructionLines.unshift('Capture the required on-site field measurements before closing the stop. Lab results do not belong in this visit workflow.');
  }

  return {
    bottleExpectations,
    requiredEvidence: buildRequiredEvidence(input.outcome),
    urgencyFlags: buildUrgencyFlags(input.visit, input.stopRequirements),
    instructionLines,
  };
}
