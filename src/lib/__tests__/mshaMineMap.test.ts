import { describe, expect, it } from 'vitest';
import {
  isJusticeController,
  normalizeOrgName,
  resolveOperatorToOrgId,
} from '../../../supabase/functions/_shared/msha-mine-map.ts';

const SUBSIDIARIES = [
  {
    subsidiary_name: 'National Coal LLC',
    organization_id: '7df6b22e-d68d-4da7-9975-a2cdaebe20ce',
    normalized_name: 'NATIONAL COAL',
  },
  {
    subsidiary_name: 'Kentucky Fuel Corporation',
    organization_id: '9019b9c8-c21b-4698-afd9-c580e2007d32',
    normalized_name: 'KENTUCKY FUEL',
  },
];

describe('msha mine map derivation', () => {
  it('normalizes operator names for exact match', () => {
    expect(normalizeOrgName('National Coal LLC')).toBe('NATIONAL COAL');
    expect(normalizeOrgName('A & G Coal Corporation')).toBe('A AND G COAL');
  });

  it('resolves known operators only with normalized exact match', () => {
    expect(resolveOperatorToOrgId('National Coal LLC', SUBSIDIARIES)).toBe(
      '7df6b22e-d68d-4da7-9975-a2cdaebe20ce',
    );
    expect(resolveOperatorToOrgId('Unrelated National Coal Company', SUBSIDIARIES)).toBeNull();
  });

  it('requires justice controller allowlist membership', () => {
    const allowlist = new Set(['0171761', 'C04355']);
    expect(isJusticeController('0171761', allowlist)).toBe(true);
    expect(isJusticeController('9999999', allowlist)).toBe(false);
  });
});
