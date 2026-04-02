import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldShell } from '@/components/layout/FieldShell';

const signOutMock = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    signOut: signOutMock,
  }),
}));

describe('FieldShell', () => {
  beforeEach(() => {
    signOutMock.mockReset();
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  it('shows the field nav and online chip', () => {
    render(
      <MemoryRouter initialEntries={['/field/route']}>
        <FieldShell>
          <div>Field content</div>
        </FieldShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('Field Ops')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Today's Route/i })).toBeInTheDocument();
    expect(screen.getByText('Field content')).toBeInTheDocument();
  });

  it('opens the mobile drawer and signs out', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/field/route']}>
        <FieldShell>
          <div>Field content</div>
        </FieldShell>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Open field navigation' }));
    expect(screen.getByText('Field Navigation')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOutMock).toHaveBeenCalled();
  });
});
