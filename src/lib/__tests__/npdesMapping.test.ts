import { describe, expect, it } from 'vitest';
import {
  classifyRegistryPermitId,
  isLikelyDmlrMiningId,
  isValidFederalNpdesId,
  registryGapHint,
  suggestedConfirmationBases,
  validateConfirmationBasis,
  validateFederalNpdesId,
} from '@/lib/npdesMapping';

describe('npdesMapping', () => {
  it('validates federal NPDES format', () => {
    expect(isValidFederalNpdesId('VA0081742')).toBe(true);
    expect(isValidFederalNpdesId('AL0062693')).toBe(true);
    expect(validateFederalNpdesId('va0081742').valid).toBe(true);
    expect(validateFederalNpdesId('1100877').valid).toBe(false);
    expect(validateFederalNpdesId('XX0123456').valid).toBe(false);
  });

  it('detects DMLR mining IDs vs pseudo VA NPDES', () => {
    expect(isLikelyDmlrMiningId('1100877')).toBe(true);
    expect(classifyRegistryPermitId('1100877', 'VA')).toBe('dmlr_mining');
    expect(classifyRegistryPermitId('VA1101916', 'VA')).toBe('pseudo_va_npdes');
    expect(classifyRegistryPermitId('VA0081742', 'VA')).toBe('federal_npdes');
  });

  it('returns operator hints for registry gaps', () => {
    expect(registryGapHint('1101916', 'VA')).toContain('DMLR');
    expect(registryGapHint('VA1101916', 'VA')).toContain('pseudo-NPDES');
  });

  it('validates confirmation basis for VA overrides', () => {
    expect(validateConfirmationBasis(null, null, { required: true }).valid).toBe(false);
    expect(validateConfirmationBasis('va_deq_ceds', null).valid).toBe(true);
    expect(validateConfirmationBasis('va_deq_ceds', null, { requireReference: true }).valid).toBe(false);
    expect(validateConfirmationBasis('va_deq_ceds', 'TODO: CEDS cite', { requireReference: true }).valid).toBe(false);
    expect(validateConfirmationBasis('va_deq_ceds', 'CEDS record 1101916', { requireReference: true }).valid).toBe(true);
    expect(validateConfirmationBasis('other', null).valid).toBe(false);
    expect(validateConfirmationBasis('other', 'CEDS-12345').valid).toBe(true);
    expect(suggestedConfirmationBases('dmlr_mining')).toContain('cd_attachment_f');
  });
});
