import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAutoClassify } from '@/hooks/useAutoClassify';

describe('useAutoClassify outreach documents', () => {
  it('detects sampling matrix and consent decree filenames', () => {
    const { result } = renderHook(() => useAutoClassify());

    const matrix = result.current.classify('SCC_Sampling_Matrix_2026.xlsx');
    expect(matrix.category).toBe('sampling_matrix');
    expect(matrix.confidence).not.toBe('low');

    const calendar = result.current.classify('Obligation_Calendar_WV.csv');
    expect(calendar.category).toBe('sampling_matrix');

    const cd = result.current.classify('Consent_Decree_7-16-cv-00462-GEC.pdf');
    expect(cd.category).toBe('consent_decree');
    expect(cd.confidence).not.toBe('low');
  });
});
