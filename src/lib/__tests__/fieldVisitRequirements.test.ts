import { describe, expect, it } from 'vitest';
import { buildFieldVisitRequirementsModel } from '@/lib/fieldVisitRequirements';
import type { FieldVisitListItem, FieldVisitRequiredMeasurement, FieldVisitStopRequirement } from '@/types';

const baseVisit: FieldVisitListItem = {
  id: 'visit-1',
  organization_id: 'org-1',
  permit_id: 'permit-1',
  outfall_id: 'outfall-1',
  assigned_to: 'user-1',
  assigned_by: 'user-2',
  scheduled_date: '2026-04-01',
  visit_status: 'assigned',
  outcome: null,
  started_at: null,
  completed_at: null,
  started_latitude: null,
  started_longitude: null,
  completed_latitude: null,
  completed_longitude: null,
  weather_conditions: null,
  field_notes: null,
  potential_force_majeure: false,
  potential_force_majeure_notes: null,
  linked_sampling_event_id: null,
  sampling_calendar_id: null,
  route_batch_id: null,
  created_at: '2026-04-01T12:00:00Z',
  updated_at: '2026-04-01T12:00:00Z',
  permit_number: 'WV1234567',
  outfall_number: '001',
  assigned_to_name: 'Field User',
  route_stop_sequence: 1,
  route_priority_rank: 1,
  route_priority_reason: 'Short-hold sample on active route.',
};

const stopRequirements: FieldVisitStopRequirement[] = [
  {
    calendar_id: 'cal-1',
    schedule_id: 'sched-1',
    parameter_id: 'param-1',
    parameter_name: 'VOC 40 mL vial',
    parameter_short_name: 'VOC',
    parameter_label: 'VOC',
    category: 'chemical',
    default_unit: null,
    sample_type: 'grab',
    schedule_instructions: 'Short hold sample. Keep collection moving.',
  },
];

const requiredMeasurements: FieldVisitRequiredMeasurement[] = [
  {
    key: 'ph',
    parameter_name: 'pH',
    display_label: 'pH',
    default_unit: 's.u.',
    rationale: 'Field reading',
    source_parameter_names: ['pH'],
  },
];

describe('buildFieldVisitRequirementsModel', () => {
  it('derives bottle expectations and urgency flags from stop context', () => {
    const model = buildFieldVisitRequirementsModel({
      visit: baseVisit,
      outcome: 'sample_collected',
      stopRequirements,
      requiredMeasurements,
    });

    expect(model.bottleExpectations).toContain('40 mL vial');
    expect(model.urgencyFlags.map((flag) => flag.label)).toContain('Short-hold handling');
    expect(model.requiredEvidence.map((item) => item.label)).toContain('Chain of custody');
  });
});
