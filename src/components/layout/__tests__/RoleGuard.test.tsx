import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleGuard } from '@/components/layout/RoleGuard';

const usePermissionsMock = vi.fn();

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => usePermissionsMock(),
}));

describe('RoleGuard', () => {
  beforeEach(() => {
    usePermissionsMock.mockReset();
  });

  it('shows loading while permissions resolve', () => {
    usePermissionsMock.mockReturnValue({
      hasAllowedRole: vi.fn(),
      loading: true,
      availability: 'ready',
    });

    render(
      <MemoryRouter>
        <RoleGuard allowedRoles={['admin']}>
          <div>Protected</div>
        </RoleGuard>
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading permissions...')).toBeInTheDocument();
  });

  it('renders an explicit unavailable state when permissions cannot be verified', () => {
    usePermissionsMock.mockReturnValue({
      hasAllowedRole: vi.fn(),
      loading: false,
      availability: 'unavailable',
    });

    render(
      <MemoryRouter>
        <RoleGuard allowedRoles={['admin']}>
          <div>Protected</div>
        </RoleGuard>
      </MemoryRouter>,
    );

    expect(screen.getByText('Permissions unavailable')).toBeInTheDocument();
  });

  it('redirects unauthorized users to the dashboard', () => {
    usePermissionsMock.mockReturnValue({
      hasAllowedRole: () => false,
      loading: false,
      availability: 'ready',
    });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/dashboard" element={<div>Dashboard</div>} />
          <Route
            path="/admin"
            element={(
              <RoleGuard allowedRoles={['admin']} scope="global">
                <div>Protected</div>
              </RoleGuard>
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
