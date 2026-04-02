import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuditLogQuery } from '@/hooks/useAuditLogQuery';

const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const defaultFilters = {
  dateFrom: null as string | null,
  dateTo: null as string | null,
  userId: null as string | null,
  module: null as string | null,
  action: null as string | null,
};

describe('useAuditLogQuery', () => {
  beforeEach(() => {
    fromMock.mockReset();
    fromMock.mockImplementation(() => ({
      select: () => ({
        order: () => ({
          range: () => Promise.resolve({ data: [], error: null, count: 0 }),
        }),
      }),
    }));
  });

  it('does not call Supabase when disabled (no audit_log fetch before route gate)', async () => {
    const { result } = renderHook(() => useAuditLogQuery(defaultFilters, false));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('queries audit_log when enabled', async () => {
    const { result } = renderHook(() => useAuditLogQuery(defaultFilters, true));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(fromMock).toHaveBeenCalledWith('audit_log');
  });
});
