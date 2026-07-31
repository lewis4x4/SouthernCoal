import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MshaStatusPanel } from '@/components/external-data/MshaStatusPanel';

const refetchMsha = vi.fn();

vi.mock('@/hooks/useExternalData', () => ({
  useExternalData: () => ({
    mshaInspections: [],
    mshaLoading: false,
    refetchMsha,
  }),
}));

describe('MshaStatusPanel derived-map status', () => {
  beforeEach(() => {
    refetchMsha.mockReset();
  });

  it('treats a returned derived-map status as configured even when it has no active mines', () => {
    render(
      <MshaStatusPanel
        mapStatus={{
          active_mines: 0,
          active_orgs: 0,
          review_mines: 3,
          last_refresh: '2026-07-31T12:00:00.000Z',
          last_reconcile: null,
        }}
      />,
    );

    expect(screen.getByText('0 mapped mines')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('Not configured')).not.toBeInTheDocument();
  });

  it('refreshes the derived map only when an authorized callback is provided', () => {
    const onRefreshMap = vi.fn();
    render(
      <MshaStatusPanel
        mapStatus={{
          active_mines: 106,
          active_orgs: 27,
          review_mines: 0,
          last_refresh: null,
          last_reconcile: null,
        }}
        canRefreshMap
        onRefreshMap={onRefreshMap}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh derived MSHA map' }));
    expect(onRefreshMap).toHaveBeenCalledOnce();
    expect(refetchMsha).not.toHaveBeenCalled();
  });
});
