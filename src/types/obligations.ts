/**
 * Consent Decree Obligation types — matches DB schema after migration 004.
 *
 * Actual DB columns: id, paragraph_number, title, description, obligation_type,
 * frequency, initial_due_date, next_due_date, responsible_role, status,
 * evidence_document_id, notes, created_at, updated_at,
 * completion_date, days_at_risk, penalty_tier, accrued_penalty (generated)
 */
export interface Obligation {
  id: string;
  paragraph_number: string | null;
  title: string | null;
  description: string;
  obligation_type: string | null;
  frequency: string | null;
  initial_due_date: string | null;
  next_due_date: string | null;
  responsible_role: string | null;
  status: string;
  evidence_document_id: string | null;
  notes: string | null;
  completion_date: string | null;
  // Server-generated columns (migration 004)
  days_at_risk: number;
  penalty_tier: PenaltyTier;
  accrued_penalty: number;
  created_at: string;
  updated_at: string;
}

export type PenaltyTier = 'none' | 'tier_1' | 'tier_2' | 'tier_3';

/** Matches consent_decree_obligations_status_check in Postgres. */
export type ObligationStatus = 'active' | 'completed' | 'overdue' | 'waived' | 'modified';

/** Statuses for obligations still subject to tracking and penalties. */
export const OPEN_OBLIGATION_STATUSES: ObligationStatus[] = ['active', 'overdue', 'modified'];

export function obligationStatusLabel(status: ObligationStatus | string): string {
  switch (status) {
    case 'active': return 'Active';
    case 'completed': return 'Completed';
    case 'overdue': return 'Overdue';
    case 'waived': return 'Waived';
    case 'modified': return 'Modified';
    default: return status;
  }
}

export function tierLabel(tier: PenaltyTier): string {
  switch (tier) {
    case 'tier_1': return 'Tier 1 (1–14 days)';
    case 'tier_2': return 'Tier 2 (15–30 days)';
    case 'tier_3': return 'Tier 3 (31+ days)';
    default: return 'Current';
  }
}

export function tierColor(tier: PenaltyTier): string {
  switch (tier) {
    case 'tier_1': return 'yellow';
    case 'tier_2': return 'orange';
    case 'tier_3': return 'red';
    default: return 'emerald';
  }
}
