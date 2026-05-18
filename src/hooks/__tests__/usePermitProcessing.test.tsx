import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logMock = vi.fn();
const invokeMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/hooks/useAuditLog', () => ({
  useAuditLog: () => ({ log: logMock }),
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

describe('usePermitProcessing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValue({
      select: () => ({
        order: () => Promise.resolve({ data: [] }),
      }),
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('logs bulk_process_permits once when processAllQueued runs', async () => {
    vi.useFakeTimers();

    const { useQueueStore } = await import('@/stores/queue');
    useQueueStore.setState({
      entries: [
        {
          id: 'q1',
          file_name: 'a.pdf',
          file_category: 'npdes_permit',
          status: 'queued',
        } as never,
      ],
    });

    const { usePermitProcessing } = await import('@/hooks/usePermitProcessing');
    const { result } = renderHook(() => usePermitProcessing());

    const run = act(async () => {
      const promise = result.current.processAllQueued();
      await vi.runAllTimersAsync();
      await promise;
    });

    await run;

    expect(logMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith(
      'bulk_process_permits',
      { count: 1, source: 'processing_queue' },
      { module: 'upload_dashboard', tableName: 'file_processing_queue' },
    );

    vi.useRealTimers();
  });

  it('does not log bulk_process_permits when queue is empty', async () => {
    const { useQueueStore } = await import('@/stores/queue');
    useQueueStore.setState({ entries: [] });

    const { usePermitProcessing } = await import('@/hooks/usePermitProcessing');
    const { result } = renderHook(() => usePermitProcessing());

    await act(async () => {
      await result.current.processAllQueued();
    });

    expect(logMock).not.toHaveBeenCalled();
  });
});
