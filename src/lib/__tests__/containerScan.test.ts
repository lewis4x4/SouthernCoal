import { describe, expect, it } from 'vitest';
import { parseContainerScan, validateContainerAgainstStop } from '@/lib/containerScan';
import type { FieldVisitStopRequirement } from '@/types';

function requirement(overrides: Partial<FieldVisitStopRequirement>): FieldVisitStopRequirement {
  return {
    calendar_id: 'cal-1',
    schedule_id: 'sched-1',
    parameter_id: 'param-1',
    parameter_name: 'E. coli',
    parameter_short_name: 'E. coli',
    parameter_label: 'E. coli',
    category: 'microbial',
    default_unit: null,
    sample_type: 'grab',
    schedule_instructions: 'Collect in sterile bottle.',
    ...overrides,
  };
}

describe('parseContainerScan', () => {
  it('parses container id, serial, and bottle hints from a scan string', () => {
    expect(parseContainerScan('CID=VOC-40ML-123|SER=SN-1|HNO3')).toEqual({
      raw_value: 'CID=VOC-40ML-123|SER=SN-1|HNO3',
      container_id: 'VOC-40ML-123',
      serial_id: 'SN-1',
      bottle_type: '40ml_vial',
      preservative_hint: 'nitric acid',
    });
  });
});

describe('validateContainerAgainstStop', () => {
  it('returns match when the scan fits the stop bottle expectation', () => {
    const validation = validateContainerAgainstStop(
      parseContainerScan('CID=STERILE-250-1|STERILE'),
      [requirement({})],
    );

    expect(validation.status).toBe('match');
    expect(validation.blocking).toBe(false);
  });

  it('returns blocking warning for a known mismatch', () => {
    const validation = validateContainerAgainstStop(
      parseContainerScan('CID=VOC-40ML-123|VOC'),
      [requirement({})],
    );

    expect(validation.status).toBe('warning');
    expect(validation.blocking).toBe(true);
    expect(validation.message).toMatch(/wrong for this stop/i);
  });

  it('returns unknown when no bottle rule can be derived', () => {
    const validation = validateContainerAgainstStop(
      parseContainerScan('CID=GENERIC-001'),
      [requirement({
        parameter_name: 'pH',
        parameter_label: 'pH',
        sample_type: 'grab',
        schedule_instructions: 'Collect sample at outfall.',
      })],
    );

    expect(validation.status).toBe('unknown');
    expect(validation.blocking).toBe(false);
  });
});
