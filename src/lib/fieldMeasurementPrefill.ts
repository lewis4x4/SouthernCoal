import type {
  FieldMeasurementRecord,
  FieldVisitRequiredMeasurement,
  FieldVisitStopRequirement,
} from '@/types';

type MeasurementTemplate = {
  key: string;
  parameterName: string;
  displayLabel: string;
  defaultUnit: string | null;
  rationale: string;
  matches: RegExp[];
};

const FIELD_MEASUREMENT_TEMPLATES: MeasurementTemplate[] = [
  {
    key: 'ph',
    parameterName: 'pH',
    displayLabel: 'pH',
    defaultUnit: 's.u.',
    rationale: 'Capture pH on site when the stop schedule includes pH-driven chemistry requirements.',
    matches: [/\bph\b/i],
  },
  {
    key: 'temperature',
    parameterName: 'Temperature',
    displayLabel: 'Temperature',
    defaultUnit: 'C',
    rationale: 'Temperature is a field reading and should be recorded at the outlet when scheduled.',
    matches: [/temperature/i, /\btemp\b/i],
  },
  {
    key: 'conductivity',
    parameterName: 'Conductivity',
    displayLabel: 'Conductivity',
    defaultUnit: 'uS/cm',
    rationale: 'Conductivity is a field meter reading and belongs in the visit, not downstream lab entry.',
    matches: [/conduct/i, /specific conductance/i],
  },
  {
    key: 'dissolved_oxygen',
    parameterName: 'Dissolved Oxygen',
    displayLabel: 'Dissolved oxygen',
    defaultUnit: 'mg/L',
    rationale: 'Dissolved oxygen must be captured on site when it is part of the stop requirement.',
    matches: [/dissolved oxygen/i, /\bdo\b/i],
  },
  {
    key: 'flow_instantaneous',
    parameterName: 'Flow, Instantaneous',
    displayLabel: 'Instantaneous flow',
    defaultUnit: 'cfs',
    rationale: 'Instantaneous flow should be captured as a field observation when required by the stop.',
    matches: [/flow/i],
  },
  {
    key: 'turbidity',
    parameterName: 'Turbidity',
    displayLabel: 'Turbidity',
    defaultUnit: 'NTU',
    rationale: 'Turbidity is a field-observable meter reading when the stop calls for it.',
    matches: [/turbidity/i],
  },
];

/** Short placeholder for required measurement inputs — reinforces field vs lab boundary (Week 1 A2). */
export function fieldMeasurementInputPlaceholder(
  measurement: FieldVisitRequiredMeasurement,
): string {
  const unit = measurement.default_unit?.trim();
  if (unit) {
    return `On-site reading (${unit}) — not lab analyte results`;
  }
  return 'On-site field reading — lab results import separately';
}

export function deriveRequiredFieldMeasurements(
  stopRequirements: FieldVisitStopRequirement[],
): FieldVisitRequiredMeasurement[] {
  return FIELD_MEASUREMENT_TEMPLATES.flatMap((template) => {
    const matchedRequirements = stopRequirements.filter((requirement) =>
      template.matches.some((matcher) => matcher.test(requirement.parameter_name)),
    );

    if (matchedRequirements.length === 0) {
      return [];
    }

    const fallbackUnit =
      matchedRequirements.find((requirement) => requirement.default_unit)?.default_unit ?? null;

    return [{
      key: template.key,
      parameter_name: template.parameterName,
      display_label: template.displayLabel,
      default_unit: template.defaultUnit ?? fallbackUnit,
      rationale: template.rationale,
      source_parameter_names: matchedRequirements.map((requirement) => requirement.parameter_label),
    }];
  });
}

function normalizeMeasurementAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function addAliasVariants(target: Set<string>, value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return;

  target.add(trimmed);

  const withoutParens = trimmed.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (withoutParens) {
    target.add(withoutParens);
  }

  for (const match of trimmed.matchAll(/\(([^)]+)\)/g)) {
    const inner = match[1]?.trim();
    if (inner) {
      target.add(inner);
    }
  }
}

export function getRequiredMeasurementAliases(
  requirement: FieldVisitRequiredMeasurement,
): string[] {
  const aliases = new Set<string>();
  addAliasVariants(aliases, requirement.parameter_name);
  addAliasVariants(aliases, requirement.display_label);
  for (const sourceName of requirement.source_parameter_names) {
    addAliasVariants(aliases, sourceName);
  }
  return [...aliases];
}

export function measurementMatchesRequiredFieldMeasurement(
  parameterName: string | null | undefined,
  requirement: FieldVisitRequiredMeasurement,
): boolean {
  const normalizedParameterName = normalizeMeasurementAlias(parameterName ?? '');
  if (!normalizedParameterName) return false;

  return getRequiredMeasurementAliases(requirement).some(
    (alias) => normalizeMeasurementAlias(alias) === normalizedParameterName,
  );
}

export function findSavedMeasurementForRequirement(
  measurements: FieldMeasurementRecord[],
  requirement: FieldVisitRequiredMeasurement,
): FieldMeasurementRecord | undefined {
  return measurements.find((measurement) =>
    measurementMatchesRequiredFieldMeasurement(measurement.parameter_name, requirement),
  );
}
