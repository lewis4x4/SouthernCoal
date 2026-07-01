import { describe, expect, it } from 'vitest';
import { PARAMETER_MAP } from '../../../supabase/functions/_shared/lab-import-records.ts';
import {
  CRITICAL_LAB_PARAMETER_ALIASES,
  SEEDED_CANONICAL_PARAMETER_NAMES,
  validateParserParameterMap,
} from '@/lib/parameterAliasValidation';

describe('parameterAliasValidation (2.64)', () => {
  it('validates shared PARAMETER_MAP against seeded canonical parameters', () => {
    const result = validateParserParameterMap(PARAMETER_MAP);
    expect(result.mappedKeyCount).toBeGreaterThan(20);
    expect(result.unmappedCritical).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('covers all critical WV EDD alias keys', () => {
    for (const alias of CRITICAL_LAB_PARAMETER_ALIASES) {
      expect(PARAMETER_MAP).toHaveProperty(alias);
    }
  });

  it('documents seeded canonical parameter inventory', () => {
    expect(SEEDED_CANONICAL_PARAMETER_NAMES.length).toBeGreaterThanOrEqual(21);
    expect(SEEDED_CANONICAL_PARAMETER_NAMES).toContain('Iron, Total');
    expect(SEEDED_CANONICAL_PARAMETER_NAMES).toContain('Specific Conductance');
  });
});
