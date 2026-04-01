import { describe, expect, it } from 'vitest';
import {
  deriveRequiredFieldMeasurements,
  findSavedMeasurementForRequirement,
  fieldMeasurementInputPlaceholder,
  getRequiredMeasurementAliases,
  measurementMatchesRequiredFieldMeasurement,
} from '@/lib/fieldMeasurementPrefill';
import type { FieldMeasurementRecord, FieldVisitRequiredMeasurement, FieldVisitStopRequirement } from '@/types';

function requirement(overrides: Partial<FieldVisitStopRequirement>): FieldVisitStopRequirement {
  return {
    calendar_id: 'cal-1',
    schedule_id: 'sched-1',
    parameter_id: 'param-1',
    parameter_name: 'pH',
    parameter_short_name: 'pH',
    parameter_label: 'pH',
    category: 'physical',
    default_unit: 's.u.',
    sample_type: 'grab',
    schedule_instructions: null,
    ...overrides,
  };
}

function requiredMeasurement(
  overrides: Partial<FieldVisitRequiredMeasurement>,
): FieldVisitRequiredMeasurement {
  return {
    key: 'temperature',
    parameter_name: 'Temperature',
    display_label: 'Temperature',
    default_unit: 'C',
    rationale: '',
    source_parameter_names: ['Temperature (Temp)'],
    ...overrides,
  };
}

function measurementRecord(
  overrides: Partial<FieldMeasurementRecord>,
): FieldMeasurementRecord {
  return {
    id: 'measurement-1',
    field_visit_id: 'visit-1',
    parameter_name: 'Temperature',
    measured_value: 12,
    measured_text: null,
    unit: 'C',
    measured_at: '2026-04-01T12:00:00Z',
    metadata: {},
    created_by: 'user-1',
    created_at: '2026-04-01T12:00:00Z',
    ...overrides,
  };
}

describe('deriveRequiredFieldMeasurements', () => {
  it('derives field-meter requirements from stop parameters', () => {
    const measurements = deriveRequiredFieldMeasurements([
      requirement({ parameter_name: 'pH', parameter_label: 'pH' }),
      requirement({
        calendar_id: 'cal-2',
        parameter_id: 'param-2',
        parameter_name: 'Temperature',
        parameter_label: 'Temperature',
        default_unit: 'C',
      }),
    ]);

    expect(measurements).toEqual([
      expect.objectContaining({ parameter_name: 'pH', default_unit: 's.u.' }),
      expect.objectContaining({ parameter_name: 'Temperature', default_unit: 'C' }),
    ]);
  });

  it('ignores non-field lab-style parameters', () => {
    const measurements = deriveRequiredFieldMeasurements([
      requirement({
        parameter_name: 'Iron, Total',
        parameter_label: 'Iron, Total',
        default_unit: 'mg/L',
      }),
    ]);

    expect(measurements).toEqual([]);
  });
});

describe('fieldMeasurementInputPlaceholder', () => {
  it('mentions lab separation and unit when present', () => {
    const text = fieldMeasurementInputPlaceholder({
      key: 'ph',
      parameter_name: 'pH',
      display_label: 'pH',
      default_unit: 's.u.',
      rationale: '',
      source_parameter_names: [],
    });
    expect(text).toContain('s.u.');
    expect(text.toLowerCase()).toContain('not lab');
  });

  it('uses generic field-only copy without unit', () => {
    const text = fieldMeasurementInputPlaceholder({
      key: 'x',
      parameter_name: 'X',
      display_label: 'X',
      default_unit: null,
      rationale: '',
      source_parameter_names: [],
    });
    expect(text.toLowerCase()).toContain('lab');
  });
});

describe('measurementMatchesRequiredFieldMeasurement', () => {
  it('matches canonical and source-name aliases', () => {
    const required = requiredMeasurement({
      parameter_name: 'Conductivity',
      display_label: 'Conductivity',
      source_parameter_names: ['Conductivity (Specific Conductance)'],
    });

    expect(measurementMatchesRequiredFieldMeasurement('Conductivity', required)).toBe(true);
    expect(measurementMatchesRequiredFieldMeasurement('Specific Conductance', required)).toBe(true);
  });

  it('finds previously saved alias rows for a requirement', () => {
    const required = requiredMeasurement({
      source_parameter_names: ['Temperature (Temp)'],
    });
    const saved = findSavedMeasurementForRequirement(
      [measurementRecord({ parameter_name: 'Temp' })],
      required,
    );

    expect(saved?.parameter_name).toBe('Temp');
  });

  it('returns all derived aliases for downstream matching', () => {
    const aliases = getRequiredMeasurementAliases(requiredMeasurement({
      source_parameter_names: ['Temperature (Temp)'],
    }));

    expect(aliases).toContain('Temperature');
    expect(aliases).toContain('Temp');
  });
});
