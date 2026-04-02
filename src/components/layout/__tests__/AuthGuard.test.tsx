import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGuard } from '@/components/layout/AuthGuard';

const useAuthMock = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

describe('AuthGuard', () => {
  beforeEach(() => {
    useAuthMock.mockReset();
  });

  it('shows a loading state while auth is bootstrapping', () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      loading: true,
    });

    render(
      <MemoryRouter>
        <AuthGuard>
          <div>Protected</div>
        </AuthGuard>
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to login', () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route path="/login" element={<div>Login page</div>} />
          <Route
            path="/private"
            element={(
              <AuthGuard>
                <div>Protected</div>
              </AuthGuard>
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Login page')).toBeInTheDocument();
  });
});
