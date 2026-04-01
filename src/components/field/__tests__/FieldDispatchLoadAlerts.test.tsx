import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FieldDispatchLoadAlerts } from '@/components/field/FieldDispatchLoadAlerts';

describe('FieldDispatchLoadAlerts', () => {
  it('renders nothing when there are no alerts', () => {
    const { container } = render(<FieldDispatchLoadAlerts alerts={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders role=alert with each message line', () => {
    render(<FieldDispatchLoadAlerts alerts={['Permits: timeout', 'Field visits: RLS']} />);

    const region = screen.getByRole('alert');
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent('Field queue data may be incomplete');
    expect(region).toHaveTextContent('Permits: timeout');
    expect(region).toHaveTextContent('Field visits: RLS');
  });
});
