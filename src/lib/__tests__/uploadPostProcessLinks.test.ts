import { describe, expect, it } from 'vitest';
import {
  getArchiveSuccessMessage,
  getUploadPostProcessFollowUp,
} from '@/lib/uploadPostProcessLinks';

describe('uploadPostProcessLinks', () => {
  it('maps outreach categories to follow-up routes', () => {
    expect(getUploadPostProcessFollowUp('sampling_matrix')?.href).toBe('/field/schedule');
    expect(getUploadPostProcessFollowUp('consent_decree')?.href).toBe('/obligations');
    expect(getUploadPostProcessFollowUp('water_monitoring')?.href).toBe('/monitoring');
    expect(getUploadPostProcessFollowUp('dmr')?.href).toBe('/dmr');
    expect(getUploadPostProcessFollowUp('lab_data')?.href).toBe('/monitoring');
    expect(getUploadPostProcessFollowUp('npdes_permit')?.href).toBe('/monitoring');
    expect(getUploadPostProcessFollowUp('field_inspection')?.href).toBe('/search');
    expect(getUploadPostProcessFollowUp('enforcement')?.href).toBe('/search');
  });

  it('builds concise success messages', () => {
    expect(getArchiveSuccessMessage('sampling_matrix', 'SCC_Sampling_Matrix.xlsx')).toContain(
      'SCC_Sampling_Matrix.xlsx',
    );
    expect(getArchiveSuccessMessage('audit_report', 'audit.pdf')).toContain('audit.pdf');
    expect(getArchiveSuccessMessage('other', 'misc.txt')).toContain('for search');
  });
});
