import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FieldDataSyncBar } from '@/components/field/FieldDataSyncBar';

vi.mock('@/hooks/useAuditLog', () => ({
  useAuditLog: () => ({
    log: vi.fn(),
  }),
}));

describe('FieldDataSyncBar', () => {
  const successfulSync = new Date('2026-04-01T12:34:56.000Z');

  beforeEach(() => {
    vi.useRealTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('does not infer initial freshness from loading finishing alone', async () => {
    const onRefresh = vi.fn().mockResolvedValue({ success: true });
    const { container, rerender } = render(
      <FieldDataSyncBar
        loading
        lastSyncedAt={null}
        onRefresh={onRefresh}
      />,
    );

    expect(container.textContent).toContain('Last updated —');

    rerender(
      <FieldDataSyncBar
        loading={false}
        lastSyncedAt={null}
        onRefresh={onRefresh}
      />,
    );

    await waitFor(() => {
      expect(container.textContent).toContain('Last updated —');
    });
  });

  it('shows the trusted initial sync timestamp when the owner reports success', async () => {
    const onRefresh = vi.fn().mockResolvedValue({ success: true });
    const expectedTimeLabel = successfulSync.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const { container, rerender } = render(
      <FieldDataSyncBar
        loading
        lastSyncedAt={null}
        onRefresh={onRefresh}
      />,
    );

    rerender(
      <FieldDataSyncBar
        loading={false}
        lastSyncedAt={successfulSync}
        onRefresh={onRefresh}
      />,
    );

    await waitFor(() => {
      expect(container.textContent).toContain(`Last updated ${expectedTimeLabel}`);
    });
  });

  it('does not advance the sync timestamp when refresh resolves unsuccessfully', async () => {
    const onRefresh = vi.fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });
    const expectedTimeLabel = successfulSync.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const { container } = render(
      <FieldDataSyncBar
        loading={false}
        lastSyncedAt={successfulSync}
        onRefresh={onRefresh}
      />,
    );

    const refreshButton = screen.getByRole('button', { name: /refresh field data from server/i });
    fireEvent.click(refreshButton);
    await waitFor(() => {
      expect(container.textContent).toContain(`Last updated ${expectedTimeLabel}`);
    });
    const successfulSyncText = container.textContent;

    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(container.textContent).toBe(successfulSyncText);
    });
  });
});
