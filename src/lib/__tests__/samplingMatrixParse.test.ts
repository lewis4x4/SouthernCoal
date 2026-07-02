import { describe, expect, it } from 'vitest';
import { normalizeFrequencyCode, normalizeMatrixHeader } from '@/lib/samplingMatrixParse';

describe('samplingMatrixParse', () => {
  describe('normalizeMatrixHeader', () => {
    it('lowercases and snake_cases headers', () => {
      expect(normalizeMatrixHeader('Permit Number')).toBe('permit_number');
      expect(normalizeMatrixHeader('  Outfall #  ')).toBe('outfall');
      expect(normalizeMatrixHeader('Frequency (code)')).toBe('frequency_code');
    });
  });

  describe('normalizeFrequencyCode', () => {
    it('maps common frequency labels to canonical codes', () => {
      expect(normalizeFrequencyCode('Monthly')).toBe('1/month');
      expect(normalizeFrequencyCode('semi-monthly')).toBe('2/month');
      expect(normalizeFrequencyCode('Quarterly')).toBe('1/quarter');
      expect(normalizeFrequencyCode('Annual')).toBe('1/year');
    });

    it('passes through unknown codes unchanged', () => {
      expect(normalizeFrequencyCode('  3/week  ')).toBe('3/week');
    });

    it('returns null for empty input', () => {
      expect(normalizeFrequencyCode(null)).toBeNull();
      expect(normalizeFrequencyCode('')).toBeNull();
    });
  });
});
