import { describe, expect, it } from 'vitest';
import {
  formatInspectionObstructionDetails,
  getInspectionObstructionNarrative,
  normalizePipeCondition,
  normalizeSignageCondition,
  parseInspectionObstructionDetails,
} from '@/lib/fieldVisitInspectionRouting';

describe('fieldVisitInspectionRouting', () => {
  it('normalizes legacy free-text statuses into controlled inspection options', () => {
    expect(normalizeSignageCondition('readable')).toBe('Good');
    expect(normalizeSignageCondition('missing')).toBe('Missing');
    expect(normalizePipeCondition('clear')).toBe('Good');
    expect(normalizePipeCondition('broken')).toBe('Major Damage');
  });

  it('round-trips structured obstruction type and details without counting type-only text as narrative', () => {
    const stored = formatInspectionObstructionDetails('Vegetation', 'Brush packed against the opening');
    expect(stored).toBe('Vegetation: Brush packed against the opening');
    expect(parseInspectionObstructionDetails(stored)).toEqual({
      type: 'Vegetation',
      details: 'Brush packed against the opening',
    });
    expect(getInspectionObstructionNarrative(stored)).toBe('Brush packed against the opening');
    expect(getInspectionObstructionNarrative('Vegetation')).toBe('');
  });
});
