import { describe, expect, it } from 'vitest';
import {
  fuzzyMatchOutfall,
  normalizeOutfallId,
  resolveParameterId,
  type KnownOutfall,
} from '../../../supabase/functions/_shared/lab-record-enrichment.ts';

const UAT_OUTFALLS: KnownOutfall[] = [
  { id: 'f0000004-0004-4004-8004-000000000001', outfall_number: '001', permit_id: 'permit-1' },
  { id: 'f0000004-0004-4004-8004-000000000002', outfall_number: '002', permit_id: 'permit-1' },
];

describe('lab-record-enrichment', () => {
  it('normalizes trailing .0 on outfall ids', () => {
    expect(normalizeOutfallId('1.0')).toBe('1');
    expect(normalizeOutfallId(' 001 ')).toBe('001');
  });

  it('matches outfalls exactly and with zero-strip', () => {
    const exact = fuzzyMatchOutfall('001', UAT_OUTFALLS, new Map());
    expect(exact?.outfallDbId).toBe(UAT_OUTFALLS[0]!.id);
    expect(exact?.matchMethod).toBe('exact');

    const stripped = fuzzyMatchOutfall('1', UAT_OUTFALLS, new Map());
    expect(stripped?.outfallDbId).toBe(UAT_OUTFALLS[0]!.id);
    expect(stripped?.matchMethod).toBe('zero_strip');
  });

  it('matches digits-only aliases like DO16 → 016', () => {
    const outfalls: KnownOutfall[] = [
      { id: 'uuid-016', outfall_number: '016', permit_id: 'permit-1' },
    ];
    const match = fuzzyMatchOutfall('DO16', outfalls, new Map());
    expect(match?.outfallDbId).toBe('uuid-016');
    expect(match?.matchMethod).toBe('digits_only');
  });

  it('uses cached outfall aliases before fuzzy rules', () => {
    const cache = new Map([
      ['do16', { outfallId: 'cached-id', canonicalId: '016', matchMethod: 'digits_only' as const }],
    ]);
    const match = fuzzyMatchOutfall('DO16', UAT_OUTFALLS, cache);
    expect(match?.outfallDbId).toBe('cached-id');
  });

  it('resolves parameter_id from alias cache and canonical name index', () => {
    const aliasCache = new Map([
      ['iron, total', { parameterId: 'iron-uuid', canonicalName: 'Iron' }],
    ]);
    const nameIndex = new Map([
      ['ph', 'ph-uuid'],
      ['total suspended solids', 'tss-uuid'],
    ]);

    const fromAlias = resolveParameterId(
      { parameter_raw: 'Iron, Total', parameter_canonical: 'Iron', site_state: 'VA' },
      aliasCache,
      nameIndex,
    );
    expect(fromAlias.parameterId).toBe('iron-uuid');

    const fromName = resolveParameterId(
      { parameter_raw: 'pH', parameter_canonical: 'pH', site_state: 'TN' },
      new Map(),
      nameIndex,
    );
    expect(fromName.parameterId).toBe('ph-uuid');

    const fromMap = resolveParameterId(
      { parameter_raw: 'TSS', parameter_canonical: 'Total Suspended Solids', site_state: 'AL' },
      new Map(),
      nameIndex,
    );
    expect(fromMap.parameterId).toBe('tss-uuid');
    expect(fromMap.canonical).toBe('Total Suspended Solids');
  });
});
