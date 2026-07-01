import { describe, it, expect } from 'vitest';
import {
  assessDiscrepancyDetectionReadiness,
  type DiscrepancyReadinessCounts,
} from '@/lib/discrepancyDetectionReadiness';

const EMPTY: DiscrepancyReadinessCounts = {
  echoFacilities: 0,
  echoViolations: 0,
  internalPermits: 0,
  exceedances: 0,
  dmrSubmissions: 0,
  dmrLineItems: 0,
  mshaOpenCitations: 0,
};

describe('discrepancyDetectionReadiness', () => {
  it('blocks when ECHO is not synced', () => {
    const result = assessDiscrepancyDetectionReadiness(EMPTY);
    expect(result.overall).toBe('blocked');
    expect(result.canRunMeaningfulDetection).toBe(false);
    expect(result.gates.find((g) => g.id === 'echo_sync')?.status).toBe('blocked');
  });

  it('echo_only when facilities exist but no internal permits', () => {
    const result = assessDiscrepancyDetectionReadiness({
      ...EMPTY,
      echoFacilities: 150,
      echoViolations: 5000,
    });
    expect(result.overall).toBe('echo_only');
    expect(result.gates.find((g) => g.id === 'rule1')?.status).toBe('degraded');
    expect(result.gates.find((g) => g.id === 'rule2')?.status).toBe('degraded');
  });

  it('ready when permits, exceedances, and DMR line items exist', () => {
    const result = assessDiscrepancyDetectionReadiness({
      echoFacilities: 154,
      echoViolations: 1200,
      internalPermits: 213,
      exceedances: 42,
      dmrSubmissions: 80,
      dmrLineItems: 640,
      mshaOpenCitations: 0,
    });
    expect(result.overall).toBe('ready');
    expect(result.canRunMeaningfulDetection).toBe(true);
    expect(result.gates.find((g) => g.id === 'msha_abatement')?.status).toBe('blocked');
    expect(result.gates.filter((g) => g.id !== 'msha_abatement').every((g) => g.status === 'ready')).toBe(true);
  });

  it('partial when permits exist but exceedances missing', () => {
    const result = assessDiscrepancyDetectionReadiness({
      echoFacilities: 100,
      echoViolations: 50,
      internalPermits: 20,
      exceedances: 0,
      dmrSubmissions: 0,
      dmrLineItems: 0,
      mshaOpenCitations: 0,
    });
    expect(result.overall).toBe('partial');
    expect(result.canRunMeaningfulDetection).toBe(false);
    expect(result.gates.find((g) => g.id === 'rule2')?.status).toBe('degraded');
  });

  it('enables MSHA detection when open citations exist', () => {
    const result = assessDiscrepancyDetectionReadiness({
      ...EMPTY,
      echoFacilities: 10,
      mshaOpenCitations: 2,
    });
    expect(result.canRunMshaDetection).toBe(true);
    expect(result.gates.find((g) => g.id === 'msha_abatement')?.status).toBe('ready');
  });
});
