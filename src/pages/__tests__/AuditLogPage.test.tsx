import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuditLogPage } from '@/pages/AuditLogPage';

const usePermissionsMock = vi.fn();
const useAuditLogQueryMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => usePermissionsMock(),
}));

vi.mock('@/hooks/useAuditLog', () => ({
  useAuditLog: () => ({
    log: vi.fn(),
  }),
}));

vi.mock('@/hooks/useAuditLogQuery', () => ({
  useAuditLogQuery: (...args: unknown[]) => useAuditLogQueryMock(...args),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getTotalSize: () => 0,
    getVirtualItems: () => [],
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

describe('AuditLogPage', () => {
  beforeEach(() => {
    usePermissionsMock.mockReset();
    useAuditLogQueryMock.mockReset();
    fromMock.mockReset();

    useAuditLogQueryMock.mockReturnValue({
      entries: [],
      loading: false,
      hasMore: false,
      totalCount: 0,
      loadMore: vi.fn(),
      fetchError: null,
    });
  });

  it('disables audit-log data loading for unauthorized roles', async () => {
    usePermissionsMock.mockReturnValue({
      getEffectiveRole: () => 'field_sampler',
      loading: false,
    });
    fromMock.mockReturnValue({
      select: vi.fn(),
    });

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(useAuditLogQueryMock).toHaveBeenCalled();
    });
    expect(useAuditLogQueryMock.mock.calls[0]?.[1]).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('shows an alert when the audit log query reports an error', async () => {
    usePermissionsMock.mockReturnValue({
      getEffectiveRole: () => 'admin',
      loading: false,
    });
    fromMock.mockImplementation(() => ({
      select: () => Promise.resolve({ data: [], error: null }),
    }));
    useAuditLogQueryMock.mockReturnValue({
      entries: [],
      loading: false,
      hasMore: false,
      totalCount: 0,
      loadMore: vi.fn(),
      fetchError: 'permission denied for table audit_log',
    });

    render(<AuditLogPage />);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Could not load audit log');
      expect(alert).toHaveTextContent('permission denied for table audit_log');
    });
  });
});
