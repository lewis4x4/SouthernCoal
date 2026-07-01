import { describe, expect, it } from 'vitest';
import {
  evaluateMshaCitation,
  evaluateMshaCitations,
  type MshaCitationInput,
} from '../../../supabase/functions/_shared/msha-discrepancy-rules.ts';

const BASE: MshaCitationInput = {
  id: 'f0000601-0001-4001-8001-000000000001',
  mine_id: '4602380',
  violation_number: 'UAT-VIO-001',
  event_number: 'UAT-EVT-001',
  inspection_date: '2026-06-01',
  violation_issue_date: '2026-06-06',
  abatement_due_date: '2026-06-21',
  termination_date: null,
  significant_substantial: true,
  contested: false,
  current_status: 'Open',
  proposed_penalty: 500,
};

const TODAY = new Date('2026-07-01T12:00:00Z');

describe('msha-discrepancy-rules', () => {
  it('flags overdue abatement as critical when S&S', () => {
    const result = evaluateMshaCitation(BASE, { today: TODAY });
    expect(result?.rule_id).toBe('msha_abatement_overdue');
    expect(result?.severity).toBe('critical');
    expect(result?.discrepancy_type).toBe('status_mismatch');
    expect(result?.monitoring_period_end).toBe('2026-06-21');
  });

  it('flags due-soon abatement within 14 days', () => {
    const result = evaluateMshaCitation(
      {
        ...BASE,
        id: 'f0000602-0002-4002-8002-000000000002',
        violation_number: 'UAT-VIO-002',
        significant_substantial: false,
        abatement_due_date: '2026-07-06',
      },
      { today: TODAY },
    );
    expect(result?.rule_id).toBe('msha_abatement_due_soon');
    expect(result?.severity).toBe('medium');
  });

  it('skips terminated citations', () => {
    const result = evaluateMshaCitation(
      { ...BASE, termination_date: '2026-06-25' },
      { today: TODAY },
    );
    expect(result).toBeNull();
  });

  it('flags open S&S without abatement date', () => {
    const result = evaluateMshaCitation(
      { ...BASE, abatement_due_date: null },
      { today: TODAY },
    );
    expect(result?.rule_id).toBe('msha_ss_open');
    expect(result?.severity).toBe('high');
  });

  it('evaluates UAT seed pair consistently', () => {
    const rows = evaluateMshaCitations(
      [
        BASE,
        {
          ...BASE,
          id: 'f0000602-0002-4002-8002-000000000002',
          violation_number: 'UAT-VIO-002',
          significant_substantial: false,
          abatement_due_date: '2026-07-06',
        },
      ],
      { today: TODAY },
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.rule_id)).toEqual([
      'msha_abatement_overdue',
      'msha_abatement_due_soon',
    ]);
  });
});
